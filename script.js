const heavyFeatureSelector = [
  "[data-home-canvas]",
  "[data-telegram-feed]",
  "[data-photo-feed]",
  "[data-barcelona-guide]",
  "[data-photo-dialog]",
  ".screenshot-media-item.is-image",
].join(",");
const assetVersion = "20260728-canvas-images-1";

if (document.querySelector(heavyFeatureSelector)) {
  import(`/assets/js/features.js?v=${assetVersion}`).catch((error) => console.error(error));
} else {
  initLightweightPage();
}

function initLightweightPage() {
  const languageKey = "tomilov-language";

  document.addEventListener("click", (event) => {
    const languageLink = event.target.closest("[data-language-link]");
    if (languageLink) {
      localStorage.setItem(languageKey, languageLink.dataset.lang || "ru");
      return;
    }

    const video = event.target.closest("[data-youtube]");
    if (!video) return;

    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${video.dataset.youtube}?autoplay=1&rel=0`;
    iframe.title = video.getAttribute("aria-label") || "YouTube video";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    video.replaceChildren(iframe);
    video.classList.add("is-playing");
  });

  const savedLanguage = localStorage.getItem(languageKey);
  const currentLanguage = document.querySelector("[data-page-lang]")?.dataset.pageLang || "ru";
  const savedLanguageLink = document.querySelector(`[data-language-link][data-lang="${savedLanguage}"]`);

  if (savedLanguage && savedLanguage !== currentLanguage && savedLanguageLink) {
    location.replace(savedLanguageLink.href);
  }
}
