import {
  getPlantoidConfig,
  getActiveId,
  getRegistry,
  hasExplicitSelection,
} from "./plantoid-resolver.js";

// Keep the active plantoid sticky as the user navigates between pages by
// rewriting in-site links to carry ?p=<id> (or #<id>) forward. Skips external
// links, anchors, and absolute URLs.
function propagatePlantoidIdToLinks() {
  const id = getActiveId();
  if (!id) return;

  // Only propagate if the current URL actually carries an explicit selector;
  // otherwise (apex domain default, subdomain) leave links alone.
  const params = new URLSearchParams(window.location.search);
  const hasQuery = params.has("p") || params.has("plantoid");
  const hasHash = /^#\d+$/.test(window.location.hash);
  if (!hasQuery && !hasHash) return;

  document.querySelectorAll("a[href]").forEach((a) => {
    const raw = a.getAttribute("href");
    if (!raw || raw.startsWith("#") || /^[a-z]+:\/\//i.test(raw) || raw.startsWith("mailto:")) {
      return;
    }
    const url = new URL(raw, window.location.href);
    // Skip cross-origin links
    if (url.origin !== window.location.origin) return;

    if (hasQuery) {
      url.searchParams.set("p", id);
    } else if (hasHash) {
      url.hash = `#${id}`;
    }
    a.setAttribute("href", url.pathname + url.search + url.hash);
  });
}

async function loadPlantoidContent() {
  const PLANTOID_CONFIG = await getPlantoidConfig();
  propagatePlantoidIdToLinks();

  document.title = PLANTOID_CONFIG.name;

  document
    .querySelectorAll(".plantoid-name, .logo h1")
    .forEach((el) => (el.textContent = PLANTOID_CONFIG.name));

  const subtitleElement = document.querySelector(".title-small");
  if (subtitleElement) {
    subtitleElement.textContent = `${PLANTOID_CONFIG.name}: ${PLANTOID_CONFIG.subtitle}`;
  }

  const imageElement = document.querySelector(".plantoid-image");
  if (imageElement) {
    imageElement.style.backgroundImage = `url('${PLANTOID_CONFIG.image}')`;
  }

  const descriptionElement = document.querySelector(".contributors");
  if (descriptionElement) {
    const mainDescription = PLANTOID_CONFIG.description.main
      .replace(/• /g, '<li class="bullet-item">')
      .replace(/\n\n/g, "</li></ul><br/><br/>")
      .replace(/They are:\n/g, "They are:\n<ul>")
      .replace(/themselves\.\n/g, "themselves.</li></ul>")
      .replace(/\n/g, "<br/>");

    descriptionElement.innerHTML = mainDescription;
  }

  const contributorsSection = document.querySelectorAll(".contributors")[1];
  if (contributorsSection) {
    const config = PLANTOID_CONFIG.description.contributors;
    contributorsSection.innerHTML = `
      <h3>${config.title}</h3>
      <div class="contributor-item">${config.intro}</div>
      <div class="contributor-item">${config.subtitle}</div>
      <ul>
        ${config.list
          .map((c) => `<li class="bullet-item">${c}</li>`)
          .join("")}
      </ul>
    `;
  }

  console.log(`✅ Loaded content for ${PLANTOID_CONFIG.name}`);
}

async function renderPlantoidList() {
  const reg = await getRegistry();
  const main = document.querySelector(".main-content");
  if (!main) return;

  const sorted = Object.values(reg.plantoids).sort(
    (a, b) => b.number - a.number,
  );

  document.body.classList.add("index-mode");
  main.classList.add("list-mode");
  main.innerHTML = `
    <div class="plantoid-list">
      <h2 class="plantoid-list-title">Plantoid Family</h2>
      <p class="plantoid-list-intro">Select a Plantoid to view its page.</p>
      <div class="plantoid-list-grid">
        ${sorted
          .map(
            (p) => `
          <a class="plantoid-list-card" href="?p=${p.number}">
            <div class="plantoid-list-image" style="background-image: url('${p.image}');"></div>
            <div class="plantoid-list-meta">
              <h3 class="plantoid-list-name">${p.name}</h3>
              <p class="plantoid-list-subtitle">${p.subtitle}</p>
            </div>
          </a>`,
          )
          .join("")}
      </div>
    </div>
  `;

  document.title = "Plantoid";
  document
    .querySelectorAll(".plantoid-name, .logo h1")
    .forEach((el) => (el.textContent = "PLANTOID"));

  console.log("✅ Rendered Plantoid index list");
}

async function bootstrap() {
  if (await hasExplicitSelection()) {
    await loadPlantoidContent();
  } else {
    await renderPlantoidList();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
