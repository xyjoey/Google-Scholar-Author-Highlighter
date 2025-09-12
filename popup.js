document.addEventListener('DOMContentLoaded', function() {
    const shareButton = document.getElementById('share-button');
    const extensionUrl = 'https://chromewebstore.google.com/detail/google-scholar-author-hig/ijmngekkpaccbbjimedfkjpigplaikah?hl=en';
    
    shareButton.addEventListener('click', function() {        
        chrome.tabs.create({ url: extensionUrl });
    });
}); 