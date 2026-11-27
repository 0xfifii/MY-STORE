export const THEME_KEY = "ps-theme";

/** Runs before the page paints (in <head>), so the chosen theme shows straight away with no white flash. */
export const THEME_BOOT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'light';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.themePref=p;}catch(e){}})();`;

