export const isSafariOnIos = (): boolean => {
    const userAgent = window.navigator.userAgent;
    return /iP(ad|hone|od).+Version\/[\d.]+.*Safari/.test(userAgent);
};

export const isSafari = (): boolean => {
    const userAgent = window.navigator.userAgent;
    const isChrome = /Chrome/.test(userAgent);
    const isSafari = /Safari/.test(userAgent);
    
    return isSafari && !isChrome;
};
