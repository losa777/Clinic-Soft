/** თემის არჩევანი localStorage-ში: "light" | "dark"; არ არის — სისტემური. */
export const THEME_STORAGE_KEY = "theme";

/**
 * <head>-ში, გვერდის დახატვამდე: კლასი `dark` დაუყოვნებლივ, რომ ჩატვირთვისას ღია თემა არ „აციმციმდეს“.
 * იგივე ლოგიკაა src/components/theme.tsx-ის applyTheme-ში.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;
