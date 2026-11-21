#!/usr/bin/env python3
"""Translation pipeline for the static B&V site.

English pages are the single source. Each translated page is generated from the English
HTML plus a per-language translation memory (i18n/<lang>.json: English segment -> translation),
so structure, links, prices and structured data cannot drift. Run from the repo root.

  python3 scripts/i18n.py extract        refresh i18n/segments.json (ids are permanent; new strings are appended)
  python3 scripts/i18n.py extract-lang <lang...>   work chunks for new languages without regenerating segment ids
  python3 scripts/i18n.py merge <lang> <file.json>   merge {english: translation} into the memory
  python3 scripts/i18n.py merge-ids <lang> <file.json>  merge {id: translation} (ids from i18n/work/<lang>-N.json)
  python3 scripts/i18n.py review-prep <lang>   write i18n/work/review-<lang>-N.json for an independent reviewer
  python3 scripts/i18n.py apply-review <lang> <file>   apply {id: {fix, why}} reviewer corrections
  python3 scripts/i18n.py check          validate memories (missing keys, tags/links preserved)
  python3 scripts/i18n.py build          (re)generate /<lang>/... pages, hreflang blocks, sitemap, llms.txt
  python3 scripts/i18n.py build --check  exit 1 if generated files are out of date

English page edits -> run `extract` (new/changed strings appear in todo), translate, `merge`, `build`.
"""
import glob
import hashlib
import html as htmllib
import json
import os
import posixpath
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://bookedandvisible.ca"
I18N = os.path.join(ROOT, "i18n")

# folder -> settings. Folder names are the URL prefix (/ko/, /zh-hant/ ...).
LANGS = {
    "ko": dict(html="ko", hreflang="ko", og="ko_KR", name="한국어"),
    "zh-hant": dict(html="zh-Hant", hreflang="zh-Hant", og="zh_TW", name="繁體中文"),
    "es": dict(html="es", hreflang="es", og="es_LA", name="Español"),
    "ja": dict(html="ja", hreflang="ja", og="ja_JP", name="日本語"),
    "ru": dict(html="ru", hreflang="ru", og="ru_RU", name="Русский"),
    "fr": dict(html="fr-CA", hreflang="fr-CA", og="fr_CA", name="Français"),
    "pt": dict(html="pt-BR", hreflang="pt-BR", og="pt_BR", name="Português"),
}
ACTIVE = {}  # languages complete enough to publish (set by cmd_build)
NOTE = {
    "ko": "보고서, 고객 지원, 결제, 주문서 및 법적 문서는 영어로 제공됩니다.",
    "zh-hant": "我們的報告、客戶支援、結帳、訂購表單與法律文件均以英文提供。",
    "es": "Nuestros informes, la atención al cliente, el pago, el formulario de pedido y los documentos legales están en inglés.",
    "ja": "レポート、サポート、お支払い、ご注文フォーム、法的文書は英語での提供となります。",
    "ru": "Отчёты, поддержка, оформление заказа, форма заказа и юридические документы доступны только на английском языке.",
    "fr": "Nos rapports, le soutien à la clientèle, le paiement, le formulaire de commande et les documents juridiques sont en anglais.",
    "pt": "Nossos relatórios, o suporte, o pagamento, o formulário de pedido e os documentos legais estão em inglês.",
}
SWITCH_LABEL = {"en": "Language", "ko": "언어", "zh-hant": "語言", "es": "Idioma", "ja": "言語", "ru": "Язык", "fr": "Langue", "pt": "Idioma"}

# Core pages (step 1). Path of the English file -> its URL.
CORE = ["index.html", "pricing/index.html", "ai-visibility/index.html", "seo-package/index.html",
        "stay-visible/index.html", "landing-pages/index.html", "business-card-design/index.html",
        "whats-included/index.html", "faq/index.html", "about/index.html"]


def page_url(path):
    return "/" if path == "index.html" else "/" + path[: -len("index.html")]


CORE_URLS = {page_url(p) for p in CORE}

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
INLINE = {"a", "abbr", "b", "bdi", "br", "cite", "em", "i", "img", "kbd", "mark", "q", "small", "span", "strong",
          "sub", "sup", "time", "u", "wbr", "svg", "s", "del", "ins"}
SKIP = {"script", "style", "svg", "noscript", "code", "pre", "template"}
ATTRS = ("alt", "title", "aria-label", "placeholder")
LD_TRANSLATE_KEYS = {"text", "description", "headline", "serviceType", "name"}
LD_NAME_TYPES = {"Question", "Service", "ListItem", "WebPage", "AboutPage", "Offer", "AggregateOffer"}

TOKEN = re.compile(
    r"<!--.*?-->|<(script|style)\b[^>]*>.*?</\1\s*>|<!DOCTYPE[^>]*>|</?[A-Za-z][^>]*?>|[^<]+|<",
    re.S | re.I)


class N:
    __slots__ = ("kind", "raw", "tag", "children", "end")

    def __init__(self, kind, raw="", tag=""):
        self.kind, self.raw, self.tag, self.children, self.end = kind, raw, tag, [], ""


def parse(src):
    root = N("root")
    stack = [root]
    for m in TOKEN.finditer(src):
        t = m.group(0)
        if t.startswith("<!--"):
            stack[-1].children.append(N("comment", t))
        elif m.group(1):
            n = N("raw", t, m.group(1).lower())
            stack[-1].children.append(n)
        elif t[:2].lower() == "<!":
            stack[-1].children.append(N("comment", t))
        elif t.startswith("</"):
            name = re.match(r"</\s*([A-Za-z][\w:-]*)", t).group(1).lower()
            for i in range(len(stack) - 1, 0, -1):
                if stack[i].tag == name:
                    stack[i].end = t
                    del stack[i:]
                    break
            else:
                stack[-1].children.append(N("comment", t))
        elif t.startswith("<") and len(t) > 1 and re.match(r"<[A-Za-z]", t):
            name = re.match(r"<([A-Za-z][\w:-]*)", t).group(1).lower()
            n = N("el", t, name)
            stack[-1].children.append(n)
            if name not in VOID and not t.endswith("/>"):
                stack.append(n)
        else:
            stack[-1].children.append(N("text", t))
    return root


def ser(n):
    if n.kind == "root":
        return "".join(ser(c) for c in n.children)
    if n.kind == "el":
        return n.raw + "".join(ser(c) for c in n.children) + n.end
    return n.raw


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def has_text(n):
    if n.kind == "text":
        return bool(n.raw.strip())
    if n.kind == "el" and n.tag not in SKIP:
        return any(has_text(c) for c in n.children)
    return False


def attrs_of(raw):
    return re.findall(r'(\s+)([A-Za-z_:][\w:.-]*)(?:\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+))?', raw[raw.index(" "):] if " " in raw else "")


def get_attr(raw, name):
    for _, k, v in attrs_of(raw):
        if k.lower() == name and v:
            return v[1:-1] if v[0] in "\"'" else v
    return None


def set_attr(raw, name, value):
    pat = re.compile(r'(\s%s\s*=\s*)("[^"]*"|\'[^\']*\')' % re.escape(name), re.I)
    safe = value.replace('"', "&quot;")
    return pat.sub(lambda m: m.group(1) + '"' + safe + '"', raw, count=1)


def esc_text(s):
    return re.sub(r"&(?!#?\w+;)", "&amp;", s)


# ---------------------------------------------------------------- unit walking
def walk(n, fn, ctx):
    """Call fn(kind, key, where) for every translatable string; fn returns replacement or None."""
    if n.kind != "el" and n.kind != "root":
        return
    if n.kind == "el":
        if n.tag in SKIP and not (n.tag == "script"):
            return
        if get_attr(n.raw, "translate") == "no":
            return
        # attributes
        for a in ATTRS:
            v = get_attr(n.raw, a)
            if v and re.search(r"[A-Za-z]{2}", v):
                r = fn("attr", norm(v), "%s[%s]" % (n.tag, a))
                if r is not None:
                    n.raw = set_attr(n.raw, a, r)
        if n.tag == "button" and re.search(r"\bflip\b", get_attr(n.raw, "class") or ""):
            return  # card mock-ups show English sample cards: keep their faces as is
        if n.tag == "meta":
            nm = (get_attr(n.raw, "name") or get_attr(n.raw, "property") or "").lower()
            if nm in ("description", "og:title", "og:description", "twitter:title", "twitter:description"):
                v = get_attr(n.raw, "content")
                if v:
                    r = fn("attr", norm(v), "meta:" + nm)
                    if r is not None:
                        n.raw = set_attr(n.raw, "content", r)
            return
        if n.tag == "script":
            return
    out, run = [], []

    def flush():
        nonlocal out, run
        if not run:
            return
        if not any(has_text(c) for c in run):
            out += run
        elif any(c.kind == "text" and c.raw.strip() for c in run):
            inner = "".join(ser(c) for c in run)
            lead = re.match(r"\s*", inner).group(0)
            trail = re.search(r"\s*$", inner).group(0)
            where = n.tag if n.kind == "el" else "root"
            r = fn("text", norm(inner), where)
            if r is not None:
                t = N("text", (lead if lead else "") + esc_text(r) + (trail if trail else ""))
                out.append(t)
            else:
                out += run
        else:
            for c in run:
                if c.kind == "el":
                    walk(c, fn, ctx)
                out.append(c)
        run = []

    for c in n.children:
        if c.kind == "el" and c.tag not in INLINE:
            flush()
            if c.tag == "script":
                out.append(c)
            else:
                walk(c, fn, ctx)
                out.append(c)
        elif c.kind == "el" and c.tag in ("button", "select", "textarea", "input"):
            flush()
            walk(c, fn, ctx)
            out.append(c)
        elif c.kind == "raw" and c.tag == "script":
            flush()
            out.append(c)
        elif c.kind == "el" and c.tag == "svg":
            run.append(c)
        else:
            run.append(c)
    flush()
    n.children = out


def ld_walk(o, fn, ptype=None):
    if isinstance(o, dict):
        t = o.get("@type")
        tl = t if isinstance(t, list) else [t]
        for k, v in list(o.items()):
            if isinstance(v, str):
                ok = k in ("text", "description", "headline", "serviceType") or (k == "name" and any(x in LD_NAME_TYPES for x in tl))
                if ok and re.search(r"[A-Za-z]{3}", v) and not v.startswith("http"):
                    r = fn("ld", v, "ld:" + k)
                    if r is not None:
                        o[k] = r
            else:
                ld_walk(v, fn, t)
    elif isinstance(o, list):
        for x in o:
            ld_walk(x, fn, ptype)


def transform(src, fn):
    """Return page source with every translatable string passed through fn."""
    root = parse(src)

    def ld_fix(n):
        for c in n.children:
            if c.kind == "raw" and c.tag == "script" and "ld+json" in c.raw[:200]:
                m = re.match(r"(<script[^>]*>)(.*)(</script\s*>)$", c.raw, re.S | re.I)
                data = json.loads(m.group(2))
                ld_walk(data, fn)
                c.raw = m.group(1) + "\n" + json.dumps(data, ensure_ascii=False, indent=2) + "\n" + m.group(3)
            elif c.kind == "el":
                ld_fix(c)
    walk(root, fn, None)
    ld_fix(root)
    return ser(root), root


# ---------------------------------------------------------------- memory
def mem_path(lang):
    return os.path.join(I18N, lang + ".json")


def load_mem(lang):
    p = mem_path(lang)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def save_mem(lang, mem):
    os.makedirs(I18N, exist_ok=True)
    json.dump(mem, open(mem_path(lang), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def collect():
    """Ordered dict key -> info for every segment on core pages."""
    seg = {}
    for p in CORE:
        src = open(os.path.join(ROOT, p), encoding="utf-8").read()
        src = strip_i18n(src)

        def fn(kind, key, where, p=p):
            e = seg.setdefault(key, {"kind": kind, "where": where, "pages": []})
            if p not in e["pages"]:
                e["pages"].append(p)
            return None
        transform(src, fn)
    return seg


# ---------------------------------------------------------------- english patching
HEAD_RE = re.compile(r"<!-- i18n:head -->.*?<!-- /i18n:head -->\n?", re.S)
SW_RE = re.compile(r"<!-- i18n:switch -->.*?<!-- /i18n:switch -->", re.S)
NOTE_RE = re.compile(r"<!-- i18n:note -->.*?<!-- /i18n:note -->\n?", re.S)


def strip_i18n(src):
    src = HEAD_RE.sub("", src)
    src = SW_RE.sub("", src)
    return NOTE_RE.sub("", src)


def head_block(path, current):
    u = page_url(path)
    ver = hashlib.md5(open(os.path.join(ROOT, "assets", "i18n.css"), "rb").read()).hexdigest()[:6]
    lines = ["<!-- i18n:head -->", '<link rel="stylesheet" href="/assets/i18n.css?v=%s">' % ver,
             '<link rel="alternate" hreflang="en-CA" href="%s%s">' % (SITE, u)]
    for l, c in ACTIVE.items():
        lines.append('<link rel="alternate" hreflang="%s" href="%s/%s%s">' % (c["hreflang"], SITE, l, u))
    lines.append('<link rel="alternate" hreflang="x-default" href="%s%s">' % (SITE, u))
    if current != "en":
        lines.append('<meta property="og:locale:alternate" content="en_CA">')
    for l, c in ACTIVE.items():
        if l != current:
            lines.append('<meta property="og:locale:alternate" content="%s">' % c["og"])
    lines.append("<!-- /i18n:head -->")
    return "\n".join(lines) + "\n"


def switch_block(path, current):
    u = page_url(path)
    items = ['<a href="%s" hreflang="en-CA" lang="en-CA"%s>English</a>' % (u, ' aria-current="true"' if current == "en" else "")]
    for l, c in ACTIVE.items():
        items.append('<a href="/%s%s" hreflang="%s" lang="%s"%s>%s</a>' % (
            l, u, c["hreflang"], c["html"], ' aria-current="true"' if current == l else "", c["name"]))
    if current == "en":
        cur = '<span class="lang-long">EN</span><span class="lang-short">EN</span>'
    else:
        cur = '<span class="lang-long">%s</span><span class="lang-short">%s</span>' % (LANGS[current]["name"], current.split("-")[0].upper())
    return ('<!-- i18n:switch -->\n<details class="lang"><summary aria-label="%s">%s</summary>'
            '<div class="lang-panel">%s</div></details>\n<!-- /i18n:switch -->' % (SWITCH_LABEL[current], cur, "".join(items)))


def patch_english(path, src):
    src = strip_i18n(src)
    src = src.replace("</head>", head_block(path, "en") + "</head>", 1)
    src = src.replace('<div class="hdr-r">', '<div class="hdr-r">' + switch_block(path, "en"), 1)
    return src


# ---------------------------------------------------------------- build
def rewrite_href(m, lang):
    url = m.group(2)
    base = re.split(r"[?#]", url, 1)[0]
    if base in CORE_URLS:
        return '%s/%s%s"' % (m.group(1), lang, url)
    return m.group(0)


def absolutize(out, path):
    """Pages in a language folder sit one level deeper: turn relative href/src values into root-absolute ones."""
    base = page_url(path)

    def fix(m):
        v = m.group(2)
        if v.startswith(("/", "#", "?", "http:", "https:", "mailto:", "sms:", "tel:", "data:", "javascript:")) or not v:
            return m.group(0)
        qs = ""
        mm = re.match(r"([^?#]*)([?#].*)?$", v)
        v, qs = mm.group(1), mm.group(2) or ""
        res = posixpath.normpath(posixpath.join(base, v))
        if v.endswith("/") and not res.endswith("/"):
            res += "/"
        if v in ("", "."):
            res = base
        return '%s%s%s"' % (m.group(1), res, qs)
    return re.sub(r'(\s(?:href|src|data-src|poster|action)=")([^"]*)"', fix, out)


def build_page(path, lang, mem, missing):
    src = strip_i18n(open(os.path.join(ROOT, path), encoding="utf-8").read())
    cfg = LANGS[lang]
    u = page_url(path)

    def fn(kind, key, where):
        t = mem.get(key)
        if t is None or t == "":
            missing.add(key)
            return None
        return t
    out, _ = transform(src, fn)
    out = re.sub(r'<html lang="[^"]*"', '<html lang="%s"' % cfg["html"], out, count=1)
    new_url = "%s/%s%s" % (SITE, lang, u)
    old_url = SITE + u
    out = out.replace('<link rel="canonical" href="%s">' % old_url, '<link rel="canonical" href="%s">' % new_url)
    out = out.replace('<meta property="og:url" content="%s">' % old_url, '<meta property="og:url" content="%s">' % new_url)
    out = out.replace('<meta property="og:locale" content="en_CA">', '<meta property="og:locale" content="%s">' % cfg["og"])
    # JSON-LD: this page's own URL and language
    out = out.replace('"%s"' % old_url, '"%s"' % new_url).replace('"%s#' % old_url, '"%s#' % new_url)
    out = re.sub(r'"inLanguage":\s*"[^"]*"', '"inLanguage": "%s"' % cfg["hreflang"], out)
    out = absolutize(out, path)
    # internal links to translated core pages (logo, nav, cards)
    out = re.sub(r'(href=")(/[^"]*)"', lambda m: rewrite_href(m, lang), out)
    out = out.replace("</head>", head_block(path, lang) + "</head>", 1)
    out = out.replace('<div class="hdr-r">', '<div class="hdr-r">' + switch_block(path, lang), 1)
    note = '<!-- i18n:note -->\n<p class="lang-note" role="note">%s</p>\n<!-- /i18n:note -->\n' % NOTE[lang]
    out = out.replace("</header>", "</header>\n" + note, 1)
    return out


def out_path(path, lang):
    return os.path.join(ROOT, lang, path)


def cmd_build(check=False):
    global ACTIVE
    cur = collect()
    ACTIVE = {l: c for l, c in LANGS.items() if all(load_mem(l).get(k) for k in cur)}
    skipped = [l for l in LANGS if l not in ACTIVE]
    if skipped:
        print("Not published yet (incomplete): " + ", ".join(skipped))
    stale, missing_total = [], {}
    outputs = {}
    for lang in ACTIVE:
        mem = load_mem(lang)
        miss = set()
        for p in CORE:
            outputs[out_path(p, lang)] = build_page(p, lang, mem, miss)
        if miss:
            missing_total[lang] = len(miss)
    for p in CORE:
        outputs[os.path.join(ROOT, p)] = patch_english(p, open(os.path.join(ROOT, p), encoding="utf-8").read())
    # sitemap + llms.txt
    outputs[os.path.join(ROOT, "sitemap.xml")] = patch_sitemap(open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read())
    outputs[os.path.join(ROOT, "llms.txt")] = patch_llms(open(os.path.join(ROOT, "llms.txt"), encoding="utf-8").read())
    for path, text in outputs.items():
        cur = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if cur != text:
            stale.append(os.path.relpath(path, ROOT))
            if not check:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, "w", encoding="utf-8").write(text)
    if missing_total:
        print("Untranslated segments left in English: " + ", ".join("%s=%d" % kv for kv in missing_total.items()))
    if check:
        if stale:
            print("Out of date: " + ", ".join(stale[:20]) + (" ..." if len(stale) > 20 else ""))
            return 1
        print("Generated files are up to date.")
        return 0
    print("Wrote/updated %d files." % len(stale))
    return 0


def patch_sitemap(s):
    s = re.sub(r"<!-- i18n:start -->.*?<!-- i18n:end -->\n?", "", s, flags=re.S)
    rows = []
    for l in ACTIVE:
        for p in CORE:
            rows.append("<url><loc>%s/%s%s</loc></url>" % (SITE, l, page_url(p)))
    return s.replace("</urlset>", "<!-- i18n:start -->\n" + "\n".join(rows) + "\n<!-- i18n:end -->\n</urlset>")


def patch_llms(s):
    s = re.sub(r"\n## Languages \(i18n\).*?<!-- /i18n -->\n?", "", s, flags=re.S)
    lines = ["", "## Languages (i18n)", "",
             "The main pages are also available in " + ", ".join(c["name"] for c in ACTIVE.values()) + ". "
             "Reports, support, checkout and legal documents are in English.", ""]
    for l, c in ACTIVE.items():
        lines.append("- %s: %s/%s/" % (c["name"], SITE, l))
    lines.append("<!-- /i18n -->")
    return s.rstrip("\n") + "\n" + "\n".join(lines) + "\n"


# ---------------------------------------------------------------- extract / merge / check
def cmd_extract():
    """Refresh segments.json. Ids are permanent: existing keys keep their position, new keys are appended."""
    cur = collect()
    path = os.path.join(I18N, "segments.json")
    old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    merged = {}
    for k, v in old.items():
        if k in cur:
            merged[k] = cur[k]
        else:
            v = dict(v)
            v["stale"] = True
            merged[k] = v
    added = [k for k in cur if k not in old]
    for k in added:
        merged[k] = cur[k]
    os.makedirs(I18N, exist_ok=True)
    json.dump(merged, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    keys = list(merged)
    print("%d segments (%d current, %d new, %d stale)" % (len(merged), len(cur), len(added), len(merged) - len(cur)))
    for k in added:
        print("  new id %d: %s" % (keys.index(k), k[:90]))
    for lang in LANGS:
        mem = load_mem(lang)
        print("  %s: %d to translate" % (lang, sum(1 for k in cur if not mem.get(k))))
    print("Run: python3 scripts/i18n.py extract-lang <lang...> to write translator work files.")
    return 0


def cmd_extract_lang(langs):
    """Write work chunks for the given languages from the EXISTING segments.json (ids stay stable)."""
    seg = json.load(open(os.path.join(I18N, "segments.json"), encoding="utf-8"))
    keys = list(seg)
    os.makedirs(os.path.join(I18N, "work"), exist_ok=True)
    for lang in langs:
        mem = load_mem(lang)
        todo = [i for i, k in enumerate(keys) if not mem.get(k) and not seg[k].get("stale")]
        chunks = [todo[i:i + 200] for i in range(0, len(todo), 200)]
        for f in glob.glob(os.path.join(I18N, "work", "%s-*.json" % lang)):
            os.remove(f)
        for n, ch in enumerate(chunks, 1):
            json.dump({str(i): {"en": keys[i], "kind": seg[keys[i]]["kind"], "where": seg[keys[i]]["where"]} for i in ch},
                      open(os.path.join(I18N, "work", "%s-%d.json" % (lang, n)), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("%s: %d to translate in %d chunk(s)" % (lang, len(todo), len(chunks)))
    return 0


def cmd_merge_ids(lang, path):
    keys = list(json.load(open(os.path.join(I18N, "segments.json"), encoding="utf-8")))
    mem = load_mem(lang)
    new = json.load(open(path, encoding="utf-8"))
    n = 0
    for i, v in new.items():
        if isinstance(v, str) and v.strip():
            mem[keys[int(i)]] = v
            n += 1
    save_mem(lang, mem)
    print("merged %d translations into %s" % (n, lang))
    return 0


def cmd_merge(lang, path):
    mem = load_mem(lang)
    new = json.load(open(path, encoding="utf-8"))
    n = 0
    for k, v in new.items():
        if v and v.strip():
            mem[k] = v
            n += 1
    save_mem(lang, mem)
    print("merged %d into %s" % (n, lang))
    return 0


def cmd_review_prep(lang):
    segs = json.load(open(os.path.join(I18N, "segments.json"), encoding="utf-8"))
    keys = list(segs)
    mem = load_mem(lang)
    os.makedirs(os.path.join(I18N, "work"), exist_ok=True)
    for f in glob.glob(os.path.join(I18N, "work", "review-%s-*.json" % lang)):
        os.remove(f)
    ids = [i for i, k in enumerate(keys) if mem.get(k)]
    chunks = [ids[i:i + 100] for i in range(0, len(ids), 100)]
    for n, ch in enumerate(chunks, 1):
        json.dump({str(i): {"en": keys[i], "tr": mem[keys[i]], "kind": segs[keys[i]]["kind"], "where": segs[keys[i]]["where"]} for i in ch},
                  open(os.path.join(I18N, "work", "review-%s-%d.json" % (lang, n)), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("%s: %d segments in %d review chunk(s)" % (lang, len(ids), len(chunks)))
    return 0


def cmd_apply_review(lang, path):
    """Apply reviewer fixes: file is {id: {"fix": "corrected translation", "why": "..."}}."""
    keys = list(json.load(open(os.path.join(I18N, "segments.json"), encoding="utf-8")))
    mem = load_mem(lang)
    fixes = json.load(open(path, encoding="utf-8"))
    n = 0
    for i, v in fixes.items():
        fx = v.get("fix") if isinstance(v, dict) else v
        if isinstance(fx, str) and fx.strip():
            mem[keys[int(i)]] = fx
            n += 1
    save_mem(lang, mem)
    print("applied %d reviewer fixes to %s" % (n, lang))
    return 0


def skeleton(s):
    """Tags, link targets and classes of a segment (what translation must not change)."""
    out = []
    for m in re.finditer(r"<(/?)([A-Za-z][\w-]*)([^>]*)>", s):
        a = dict((k.lower(), (v or "").strip("\"'")) for _, k, v in attrs_of("<x" + m.group(3) + ">"))
        out.append((m.group(1), m.group(2).lower(), a.get("href", ""), a.get("class", ""), a.get("src", "")))
    return out


def tokens_keep(s):
    """Digits in a segment (ignores $, trailing punctuation, CJK adjacency and ordinals like 1st/3rd)."""
    txt = htmllib.unescape(re.sub(r"<[^>]+>", " ", s))
    txt = re.sub(r"(?<=\d)[,.\s\u00a0\u202f](?=\d{3}(?!\d))", "", txt)  # 2,000 = 2 000 = 2.000
    return re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)*(?!\d)(?!(?:st|nd|rd|th)\b)", txt)


def numbers_ok(en, tr):
    """Every number in the English must appear in the translation (a translation may add digits for spelled-out numbers)."""
    from collections import Counter
    a, b = Counter(tokens_keep(en)), Counter(tokens_keep(tr))
    return all(b[t] >= n for t, n in a.items())


def cmd_check():
    seg = collect()
    bad = 0
    for lang in LANGS:
        mem = load_mem(lang)
        missing = [k for k in seg if not mem.get(k)]
        problems = []
        for k, v in mem.items():
            if k not in seg:
                continue
            if seg[k]["kind"] == "text" and skeleton(k) != skeleton(v):
                problems.append(("tags/links changed", k))
            if not numbers_ok(k, v):
                problems.append(("a number/price from the English is missing", k))
        print("%s: %d missing, %d problems" % (lang, len(missing), len(problems)))
        for why, k in problems[:15]:
            print("   -", why, "|", k[:80])
        bad += len(problems)
    return 1 if bad else 0


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return 0
    if a[0] == "extract":
        return cmd_extract()
    if a[0] == "merge":
        return cmd_merge(a[1], a[2])
    if a[0] == "extract-lang":
        return cmd_extract_lang(a[1:])
    if a[0] == "review-prep":
        return cmd_review_prep(a[1])
    if a[0] == "apply-review":
        return cmd_apply_review(a[1], a[2])
    if a[0] == "merge-ids":
        return cmd_merge_ids(a[1], a[2])
    if a[0] == "check":
        return cmd_check()
    if a[0] == "build":
        return cmd_build("--check" in a)
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
