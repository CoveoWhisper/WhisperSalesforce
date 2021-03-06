var allTabs = {};

class Setting { 
    constructor() {
        if (Setting.instance) {
            return Setting.instance; 
        }

        this.maxDocuments = this.getMaxDocuments();
        this.maxQuestions = this.getMaxQuestions();
        Setting.instance = this;
        let sourceSetting   = document.getElementById('setting-template').innerHTML;
        this.settingTemplate = Handlebars.compile(sourceSetting);
        this.settingElement = document.getElementById('settingSection');
        return this;
    }

    getMaxDocuments() {
        let retrieveMaxDocuments = localStorage.getItem('maxDocumentsWhisper');
        let maxDocuments = retrieveMaxDocuments ? retrieveMaxDocuments : 10;
        return maxDocuments;
    } 

    getMaxQuestions() {
        let retrieveMaxQuestions = localStorage.getItem('maxQuestionsWhisper') ;
        let maxQuestions = retrieveMaxQuestions ? retrieveMaxQuestions : 5;
        return maxQuestions;
    }

    setMaxDocuments(maxDocuments) {
        this.maxDocuments = maxDocuments;
        localStorage.setItem('maxDocumentsWhisper',maxDocuments);
    }
 
    setMaxQuestions(maxQuestions) {
        this.maxQuestions = maxQuestions;
        localStorage.setItem('maxQuestionsWhisper',maxQuestions);
    }

    toggleVisibility(){
        if(this.isVisible()) {
            this.hide(); 
        }
        else {
            this.show();
        }
    }
    isVisible() {
        return this.settingElement.style.display == 'none' ? false : true;
    }

    show() {
        this.settingElement.style.display = 'initial';
        let data = {
            maxDocuments:  this.maxDocuments,
            maxQuestions: this.maxQuestions
        };

        this.settingElement.innerHTML = this.settingTemplate(data);
    }

    hide() {
        this.settingElement.style.display = 'none'; 
    }
}

class ConversationTemplate {

    constructor(suggestionTemplate, questionTemplate, facetTemplate) {
        this.questions =  questionTemplate;
        this.suggestions = suggestionTemplate;
        this.facets = facetTemplate;
    }

    setQuestionContext(questionContext) {
        this.questionContext = questionContext;
    }

    setdocumentContext(documentContext) {
        this.documentContext = documentContext;
    }
    
    setFacetContext(facetContext) {
        this.facetContext = facetContext;
    }

    clear() {
        this.questionContext = null;
        this.documentContext = null;
        this.facetContext = null;
        document.getElementById('conversations').innerHTML = '';
        document.getElementById('facets').innerHTML = '';
    }

    refresh() {
        let suggestionHtml = '';
        let questionHtml = '';
        let facetHtml = '';
   
        if (this.documentContext)
            suggestionHtml = this.suggestions(this.documentContext);
        if (this.questionContext)
            questionHtml = this.questions(this.questionContext);
        if (this.facetContext)
            facetHtml = this.facets(this.facetContext);

        document.getElementById('conversations').innerHTML = questionHtml + suggestionHtml  ;
        document.getElementById('facets').innerHTML = facetHtml;
    }
}

sforce.console.setCustomConsoleComponentPopoutable(false, null);

var timeSend = null;


const SUGGESTION_ENDPOINT = 'https://whisper-dev.us-east-1.elasticbeanstalk.com/whisper/suggestions';
const FACET_ENDPOINT = 'https://whisper-dev.us-east-1.elasticbeanstalk.com/whisper/facets';

const HEADERS = {
    "Content-Type": "application/json"
};

const COLLAPSE_ICON = "fa-angle-down";
const EXPAND_ICON = "fa-angle-up";

var messageType = {
    'Chasitor': 0,
    'Agent': 1
};
var setting = null;
document.addEventListener("DOMContentLoaded", function() {
    setting = new Setting();
});

var sentMessage = {};
var chatStartedHandler = function(result) {
    
    let chatKey = result.chatKey;
    let newInstanceTemplate = addNewInstance();
    addNewTab(result, newInstanceTemplate);    
    
    fetchConversation(chatKey,newInstanceTemplate)
    sforce.console.chat.onNewMessage(chatKey, (result) => onNewMessageHandler(result, chatKey,newInstanceTemplate));       
}

var changeWhisperTab = function(result) {
    changeConversationContext(result.id);
}

sforce.console.chat.onChatStarted(chatStartedHandler);
sforce.console.onFocusedPrimaryTab (changeWhisperTab)

var onNewMessageHandler = function (result, chatKey, newInstanceTemplate) {
    timeSend = performance.now();
    newInstanceTemplate.clear();

    let query = (result.type == 'Chasitor') ?  result.content : sentMessage.url || result.content;

    let data = {
        chatkey: chatKey,
        Query: query,
        type: messageType[result.type],
        maxDocuments: setting.maxDocuments,
        maxQuestions: setting.maxQuestions
    };

    fetch( SUGGESTION_ENDPOINT, { method: "POST", body: JSON.stringify(data),  headers: HEADERS }) 
        .then(data => data.json())
        .then(json =>  createAll(json, chatKey, newInstanceTemplate))
        .catch( error =>  console.log(`Invalid URL, there is no response. Error:  ${error}`));

    sforce.console.chat.getDetailsByChatKey(chatKey, result => {
        sforce.console.focusPrimaryTabById(result.primaryTabId, null);
    });    
}

function fetchConversation(chatKey,template) {
    fetch(`${SUGGESTION_ENDPOINT}?chatkey=${chatKey}&maxDocuments=${setting.maxDocuments}&maxQuestions=${setting.maxQuestions}`)
        .then(data => data.json())
        .then(json =>  createAll(json, chatKey,template))
        .catch( error =>  console.log(`Invalid URL, there is no response. Error:  ${error}`));
}

function addNewInstance() {
    let sourceSuggestion   = document.getElementById("suggestion-template").innerHTML;
    let suggestionTemplate = Handlebars.compile(sourceSuggestion);
    let sourceQuestion   = document.getElementById("question-template").innerHTML;
    let questionTemplate = Handlebars.compile(sourceQuestion);
    let sourceFacet  = document.getElementById("facet-template").innerHTML;
    let facetTemplate = Handlebars.compile(sourceFacet);
    let template = new ConversationTemplate(suggestionTemplate,questionTemplate,facetTemplate);
    template.refresh();
    return template;
}

function addNewTab(result, instance) {
    allTabs[result.chatKey] = instance
}

function createAll(json, chatKey, template) {
    if (json.questions && json.questions.length > 0) {
        let questionContext = {
            questions: json.questions,
            chatkey: chatKey,
        };
        template.setQuestionContext(questionContext);
    }

    if (json.documents && json.documents.length > 0) {
        let documentContext = {
            documents: json.documents,
            chatkey: chatKey,
        };
        template.setdocumentContext(documentContext);
    } 

    if (json.activeFacets && json.activeFacets.length > 0) {
        let allFacetName = json.activeFacets.map(v => v.name);
        getAllFacetValues(chatKey, allFacetName, facetValues => {
            let facetContext = {
                facets: [],
                chatkey: chatKey,
            };
            facetValues.forEach(facetValue => {
                const facet = json.activeFacets.find(e => e.name === facetValue.name);
                facetContext.facets.push( {
                    id: facet.id,
                    name: facet.name,
                    values: facet.values,
                    allValues: facetValue.values
                });
            });
            template.setFacetContext(facetContext);
            template.refresh();
        });     
    }
    
    console.log(`Execution time: ${(performance.now() - timeSend).toString()}`);
    template.refresh();
    sforce.console.setCustomConsoleComponentVisible(true);
}

function facetCancelClick(chatKey, facetId) {
    let template = allTabs[chatKey];
    template.clear();
    let data = {
        chatkey: chatKey
    }; 

    fetch(`${SUGGESTION_ENDPOINT}/facets/${facetId || ''}`, { method: "DELETE", body: JSON.stringify(data),  headers: HEADERS })
        .then(() => fetchConversation(chatKey, template))
        .catch( error =>  console.log(`Invalid URL, there is no response. Error:  ${error}`));
}

function filterChangeAdd(chatkey, id, name, value) { 
    let template = allTabs[chatkey];
    const values = [value];
    const facet = { id, name, values };
    const data = {
        chatkey: chatkey,
        Facet: facet
    };
    template.clear();
    fetch(`${SUGGESTION_ENDPOINT}/filter`, { method: "PUT", body: JSON.stringify(data),  headers: HEADERS })
        .then(() => fetchConversation(chatkey, template))
        .catch( error =>  console.log(`Invalid URL, there is no response. Error:  ${error}`));
}

function filterChangeRemove(chatkey, id, name, value) {
    let template = allTabs[chatkey];
    const values = [value];
    const facet = { id, name, values };
    const data = {
        chatkey: chatkey,
        Facet: facet
    };
    template.clear();
    fetch(`${SUGGESTION_ENDPOINT}/filter`, { method: "DELETE", body: JSON.stringify(data),  headers: HEADERS })
        .then(() => fetchConversation(chatkey, template))
        .catch( error =>  console.log(`Invalid URL, there is no response. Error:  ${error}`));
}

function chooseSuggestionClick(agentInput, chatKey, suggestionId, type) {
    let data = {
        chatkey: chatKey,
        id: suggestionId
    };
    fetch(`${SUGGESTION_ENDPOINT}/select`, { method: "POST", body: JSON.stringify(data),  headers: HEADERS })
        .catch( error =>   console.log(`Invalid URL, there is no response. Error:  ${error}`));
    sforce.console.chat.setAgentInput(chatKey, agentInput, null);
}

function getAllFacetValues(chatKey, facetNames, callback) {
    let data = {
        chatkey: chatKey,
        facetsName: facetNames
    };
    fetch(FACET_ENDPOINT, { method: "POST", body: JSON.stringify(data),  headers: HEADERS }) 
        .then(data => data.json())
        .then( facetValues => callback(facetValues))
        .catch(error => console.log(`Error:  ${error}`));
}

function changeVisibilityClick(element,idToHide) {
    let classList = element.classList;
    let elementToHandle = document.getElementById(idToHide);

    if (classList.contains(COLLAPSE_ICON)) {
        classList.remove(COLLAPSE_ICON);
        classList.add(EXPAND_ICON);
        elementToHandle.style.display = "none";
    } 
    else if (classList.contains(EXPAND_ICON)) {
        classList.remove(EXPAND_ICON);
        classList.add(COLLAPSE_ICON);
        elementToHandle.style.display = "initial";
    }
}

function settingClick() {
    setting.toggleVisibility();
}

function changeMaxDocuments(maxDocuments) {
    setting.setMaxDocuments(maxDocuments);
}

function changeMaxQuestions(maxQuestions) {
    setting.setMaxQuestions(maxQuestions);
}

function changeConversationContext(tabId) {
    sforce.console.chat.getDetailsByPrimaryTabId(tabId, result => {
        if (result.details) {
            let conversations = allTabs[result.details.chatKey];
            conversations.refresh();
        }
    });
}

function openURL(url) {
    window.open(url, '_blank');
} 