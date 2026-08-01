import fs from "fs";
import https from "https";
import path from "path";

const LANGS = {
  en: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt",
  el: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/el/el_50k.txt",
  de: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt",
  fr: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt",
  it: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt",
  es: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt",
  pt: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt/pt_50k.txt",
};

const LIMIT = 8000;
const VERSION = 1;

const MAX_REDIRECTS = 5;

function fetchText(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects for ${url}`));
            res.resume();
            return;
          }
          fetchText(res.headers.location, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`${url} -> ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

function parse(text) {
  const words = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const word = parts[0];
    const freq = Number(parts[1] || 0);
    if (!word || !Number.isFinite(freq)) continue;
    if (!/^[\p{L}][\p{L}'’-]*$/u.test(word)) continue;
    if (word.length < 2) continue;
    words.push([word.toLowerCase(), Math.max(1, Math.round(freq))]);
    if (words.length >= LIMIT) break;
  }
  return words;
}

for (const [lang, url] of Object.entries(LANGS)) {
  process.stdout.write(`Fetching ${lang}...\n`);
  const text = await fetchText(url);
  const words = parse(text);
  const pack = { language: lang, version: VERSION, words };
  const json = JSON.stringify(pack);
  fs.mkdirSync("wordpacks-dist", { recursive: true });
  fs.mkdirSync(path.join("src-tauri", "resources", "wordpacks"), { recursive: true });
  fs.writeFileSync(path.join("wordpacks-dist", `${lang}.json`), json);
  if (lang === "en") {
    fs.writeFileSync(path.join("src-tauri", "resources", "wordpacks", "en.json"), json);
  }
  process.stdout.write(`  ${lang}: ${words.length} words, ${json.length} bytes\n`);
}
