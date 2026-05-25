document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-youtube]");

  if (!trigger) return;

  const videoId = trigger.getAttribute("data-youtube");
  const title = trigger.getAttribute("aria-label") || "YouTube video";
  const iframe = document.createElement("iframe");

  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
  iframe.title = title;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;

  trigger.replaceChildren(iframe);
  trigger.classList.add("is-playing");
});
