#!/usr/bin/env python3
"""Translation pipeline for the static B&V site.

English pages are the single source. Each translated page is generated from the English
HTML plus a per-language translation memory (i18n/<lang>.json: English segment -> translation),
so structure, links, prices and structured data cannot drift. Run from the repo root.

  python3 scripts/i18n.py extract        refresh i18n/segments.json (ids are permanent; new strings are appended)
  python3 scripts/i18n.py extract-pending <slug> <guide.html> [card.html]   register an unpublished guide's strings
  python3 scripts/i18n.py pending-work|pending-review|pending-status <slug>   per-guide translator/reviewer files and readiness
  python3 scripts/i18n.py extract-lang <lang...>   work chunks for new languages without regenerating segment ids
  python3 scripts/i18n.py merge <lang> <file.json>   merge {english: translation} into the memory
  python3 scripts/i18n.py merge-ids <lang> <file.json>  merge {id: translation} (ids from i18n/work/<lang>-N.json)
  python3 scripts/i18n.py review-prep <lang> [min_id]   write i18n/work/review-<lang>-N.json for an independent reviewer
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

# Pages that get translated: the core pages plus every live guide (and the guides index).
CORE_STATIC = ["index.html", "pricing/index.html", "ai-visibility/index.html", "seo-package/index.html",
               "stay-visible/index.html", "landing-pages/index.html", "business-card-design/index.html",
               "whats-included/index.html", "faq/index.html", "about/index.html"]


def page_url(path):
    return "/" if path == "index.html" else "/" + path[: -len("index.html")]


def all_pages():
    guides = ["guides/index.html"] + sorted(
        os.path.relpath(x, ROOT).replace(os.sep, "/") for x in glob.glob(os.path.join(ROOT, "guides", "*", "index.html")))
    return CORE_STATIC + [g for g in guides if os.path.exists(os.path.join(ROOT, g))]


CORE = all_pages()
CORE_URLS = {page_url(p) for p in CORE}
PAGE_KEYS = {}   # page -> set of segment keys on it (filled by collect())
READY = {}       # lang -> pages whose translation is complete
AVAIL = {}       # lang -> pages that exist in that language (ready, or an older generated file kept)

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
INLINE = {"a", "abbr", "b", "bdi", "br", "cite", "em", "i", "img", "kbd", "mark", "q", "small", "span", "strong",
          "sub", "sup", "time", "u", "wbr", "svg", "s", "del", "ins"}
SKIP = {"script", "style", "svg", "noscript", "code", "pre", "template"}
ATTRS = ("alt", "title", "aria-label", "placeholder")
LD_NAME_TYPES = {"Question", "Service", "ListItem", "WebPage", "AboutPage", "Offer", "AggregateOffer", "HowTo", "HowToStep", "Article"}

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
                ok = k in ("text", "description", "headline", "serviceType", "jobTitle") or (k == "name" and any(x in LD_NAME_TYPES for x in tl))
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

        PAGE_KEYS[p] = set()

        def fn(kind, key, where, p=p):
            PAGE_KEYS[p].add(key)
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


def langs_for(path):
    return [l for l in LANGS if path in AVAIL.get(l, ())]


def head_block(path, current):
    u = page_url(path)
    ver = hashlib.md5(open(os.path.join(ROOT, "assets", "i18n.css"), "rb").read()).hexdigest()[:6]
    langs = langs_for(path)
    lines = ["<!-- i18n:head -->", '<link rel="stylesheet" href="/assets/i18n.css?v=%s">' % ver,
             '<link rel="alternate" hreflang="en-CA" href="%s%s">' % (SITE, u)]
    for l in langs:
        lines.append('<link rel="alternate" hreflang="%s" href="%s/%s%s">' % (LANGS[l]["hreflang"], SITE, l, u))
    lines.append('<link rel="alternate" hreflang="x-default" href="%s%s">' % (SITE, u))
    if current != "en":
        lines.append('<meta property="og:locale:alternate" content="en_CA">')
    for l in langs:
        if l != current:
            lines.append('<meta property="og:locale:alternate" content="%s">' % LANGS[l]["og"])
    lines.append("<!-- /i18n:head -->")
    return "\n".join(lines) + "\n"


def switch_block(path, current):
    u = page_url(path)
    items = ['<a href="%s" hreflang="en-CA" lang="en-CA"%s>English</a>' % (u, ' aria-current="true"' if current == "en" else "")]
    for l in langs_for(path):
        c = LANGS[l]
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
    if not langs_for(path):
        return src
    src = src.replace("</head>", head_block(path, "en") + "</head>", 1)
    src = src.replace('<div class="hdr-r">', '<div class="hdr-r">' + switch_block(path, "en"), 1)
    return src


# ---------------------------------------------------------------- build
def rewrite_href(m, lang):
    url = m.group(2)
    base = re.split(r"[?#]", url, maxsplit=1)[0]
    if base in {page_url(p) for p in AVAIL.get(lang, ())}:
        return '%s/%s%s"' % (m.group(1), lang, url)
    return m.group(0)


def absolutize(out, path):
    """Pages in a language folder sit one level deeper: turn relative href/src values into root-absolute ones."""
    base = page_url(path)

    def fix(m):
        v = m.group(2)
        if v.startswith(("/", "#", "?", "http:", "https:", "mailto:", "sms:", "tel:", "data:", "javascript:")) or not v:
            return m.group(0)
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
    out = out.replace('"%s"' % old_url, '"%s"' % new_url).replace('"%s#' % old_url, '"%s#' % new_url)
    out = re.sub(r'"inLanguage":\s*"[^"]*"', '"inLanguage": "%s"' % cfg["hreflang"], out)
    out = absolutize(out, path)
    out = re.sub(r'(href=")(/[^"]*)"', lambda m: rewrite_href(m, lang), out)
    out = out.replace("</head>", head_block(path, lang) + "</head>", 1)
    out = out.replace('<div class="hdr-r">', '<div class="hdr-r">' + switch_block(path, lang), 1)
    note = '<!-- i18n:note -->\n<p class="lang-note" role="note">%s</p>\n<!-- /i18n:note -->\n' % NOTE[lang]
    out = out.replace("</header>", "</header>\n" + note, 1)
    return out


def out_path(path, lang):
    return os.path.join(ROOT, lang, path)


def cmd_build(check=False):
    global CORE, CORE_URLS
    CORE = all_pages()
    CORE_URLS = {page_url(p) for p in CORE}
    cur_keys = list(collect())
    if not check:
        run_autofill(cur_keys)
    stale_pages = {}
    for l in LANGS:
        mem = load_mem(l)
        READY[l] = {p for p in CORE if all(mem.get(k) for k in PAGE_KEYS[p])}
        AVAIL[l] = set(READY[l]) | {p for p in CORE if os.path.exists(out_path(p, l))}
        old = sorted(AVAIL[l] - READY[l])
        if old:
            stale_pages[l] = old
    partial = [("%s %d/%d" % (l, len(READY[l]), len(CORE))) for l in LANGS if len(READY[l]) < len(CORE)]
    if partial:
        print("Pages fully translated per language: " + ", ".join(partial))
    for l, old in stale_pages.items():
        print("WARNING %s: %d generated page(s) are out of date (English changed, not re-translated): %s" % (l, len(old), ", ".join(old[:6])))
    outputs = {}
    for lang in LANGS:
        mem = load_mem(lang)
        for p in sorted(READY[lang]):
            outputs[out_path(p, lang)] = build_page(p, lang, mem, set())
    for p in CORE:
        outputs[os.path.join(ROOT, p)] = patch_english(p, open(os.path.join(ROOT, p), encoding="utf-8").read())
    outputs[os.path.join(ROOT, "sitemap.xml")] = patch_sitemap(open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read())
    outputs[os.path.join(ROOT, "llms.txt")] = patch_llms(open(os.path.join(ROOT, "llms.txt"), encoding="utf-8").read())
    stale = []
    for path, text in outputs.items():
        cur = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if cur != text:
            stale.append(os.path.relpath(path, ROOT))
            if not check:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, "w", encoding="utf-8").write(text)
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
    for l in LANGS:
        for p in CORE:
            if p in AVAIL.get(l, ()):
                rows.append("<url><loc>%s/%s%s</loc></url>" % (SITE, l, page_url(p)))
    return s.replace("</urlset>", "<!-- i18n:start -->\n" + "\n".join(rows) + "\n<!-- i18n:end -->\n</urlset>")


def patch_llms(s):
    s = re.sub(r"\n## Languages \(i18n\).*?<!-- /i18n -->\n?", "", s, flags=re.S)
    langs = [l for l in LANGS if "index.html" in AVAIL.get(l, ())]
    lines = ["", "## Languages (i18n)", "",
             "The main pages and guides are also available in " + ", ".join(LANGS[l]["name"] for l in langs) + ". "
             "Reports, support, checkout and legal documents are in English.", ""]
    for l in langs:
        lines.append("- %s: %s/%s/ (guides: %s/%s/guides/)" % (LANGS[l]["name"], SITE, l, SITE, l))
    lines.append("<!-- /i18n -->")
    return s.rstrip("\n") + "\n" + "\n".join(lines) + "\n"



# ---------------------------------------------------------------- dates and counts that change at release time
EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
EN_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_ABBR = {
    "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    "ru": ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
    "fr": ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
    "pt": ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."],
}
_FULL = {
    "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    "ru": ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    "pt": ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
}


def fmt_date(lang, y, m, d, style):
    """style 'short' = guide-index card date, 'long' = byline date. Mirrors the formats already in the translation memory."""
    if lang in ("ko",):
        return "%d년 %d월 %d일" % (y, m, d)
    if lang in ("zh-hant", "ja"):
        return "%d年%d月%d日" % (y, m, d)
    if style == "short":
        if lang == "pt":
            return "%d de %s de %d" % (d, _ABBR["pt"][m - 1], y)
        return "%d %s %d" % (d, _ABBR[lang][m - 1], y)
    if lang == "pt":
        return "%d de %s de %d" % (d, _FULL["pt"][m - 1], y)
    if lang == "es":
        return "%d de %s de %d" % (d, _FULL["es"][m - 1], y)
    return "%d %s %d" % (d, _FULL[lang][m - 1], y)


_CARD = re.compile(r"^([A-Z][a-z]{2}) (\d{1,2}), (20\d\d)$")
_BYL = re.compile(r"^(By <a href=\"/about/\">Viktor</a>, founder of Booked &amp; Visible · Published )([A-Z][a-z]+) (\d{1,2}), (20\d\d)$")
_SEEALL = re.compile(r"^See all (\d+) guides(.*)$")


def autofill(lang, mem, keys):
    """Fill release-day-dependent strings (dates, 'See all N guides') from existing translations. Returns number filled."""
    filled = 0
    have = [k for k in list(mem) if mem.get(k)]  # whole memory: the older sibling string is no longer on any page
    for k in keys:
        if mem.get(k):
            continue
        m = _CARD.match(k)
        if m and m.group(1) in EN_ABBR:
            mem[k] = fmt_date(lang, int(m.group(3)), EN_ABBR.index(m.group(1)) + 1, int(m.group(2)), "short")
            filled += 1
            continue
        m = _BYL.match(k)
        if m and m.group(2) in EN_MONTHS:
            y, mo, d = int(m.group(4)), EN_MONTHS.index(m.group(2)) + 1, int(m.group(3))
            for k0 in have:
                m0 = _BYL.match(k0)
                if m0 and m0.group(2) in EN_MONTHS:
                    old = fmt_date(lang, int(m0.group(4)), EN_MONTHS.index(m0.group(2)) + 1, int(m0.group(3)), "long")
                    if old in mem[k0]:
                        mem[k] = mem[k0].replace(old, fmt_date(lang, y, mo, d, "long"))
                        filled += 1
                        break
            continue
        m = _SEEALL.match(k)
        if m:
            for k0 in have:
                m0 = _SEEALL.match(k0)
                if m0 and m0.group(2) == m.group(2) and m0.group(1) != m.group(1) and mem[k0].count(m0.group(1)) == 1:
                    mem[k] = mem[k0].replace(m0.group(1), m.group(1))
                    filled += 1
                    break
    return filled


def run_autofill(keys):
    total = 0
    for lang in LANGS:
        mem = load_mem(lang)
        n = autofill(lang, mem, keys)
        if n:
            save_mem(lang, mem)
            total += n
    if total:
        print("Auto-filled %d date/count strings" % total)


# ---------------------------------------------------------------- pending (not yet published) guides
PENDING_PATH = os.path.join(I18N, "pending.json")


def load_pending():
    return json.load(open(PENDING_PATH, encoding="utf-8")) if os.path.exists(PENDING_PATH) else {}


def save_pending(d):
    json.dump(d, open(PENDING_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def keys_of_html(src, where_page):
    out = {}

    def fn(kind, key, where):
        out.setdefault(key, {"kind": kind, "where": where, "pages": [where_page]})
        return None
    transform(strip_i18n(src), fn)
    return out


def cmd_extract_pending(slug, html_path, card_path):
    """Register the segments of a guide that is not published yet (its page + its guides-index card)."""
    path = os.path.join(I18N, "segments.json")
    seg = json.load(open(path, encoding="utf-8"))
    found = keys_of_html(open(html_path, encoding="utf-8").read(), "pending:" + slug)
    if card_path and os.path.exists(card_path):
        for k, v in keys_of_html(open(card_path, encoding="utf-8").read(), "pending:" + slug).items():
            found.setdefault(k, v)
    new = [k for k in found if k not in seg]
    for k in new:
        seg[k] = found[k]
    json.dump(seg, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    pend = load_pending()
    pend[slug] = {"keys": list(found), "new": new}
    save_pending(pend)
    run_autofill(list(found))
    print("%s: %d segments (%d new)" % (slug, len(found), len(new)))
    return 0


def _slug_ids(slug, only_new=True):
    pend = load_pending()[slug]
    seg = json.load(open(os.path.join(I18N, "segments.json"), encoding="utf-8"))
    keys = list(seg)
    return keys, seg, [keys.index(k) for k in (pend["new"] if only_new else pend["keys"])]


def cmd_pending_work(slug):
    """Translator work files for one pending guide: i18n/work/pend-<slug>-<lang>.json"""
    keys, seg, ids = _slug_ids(slug)
    os.makedirs(os.path.join(I18N, "work"), exist_ok=True)
    for lang in LANGS:
        mem = load_mem(lang)
        todo = [i for i in ids if not mem.get(keys[i])]
        path = os.path.join(I18N, "work", "pend-%s-%s.json" % (slug, lang))
        if os.path.exists(path):
            os.remove(path)
        if todo:
            json.dump({str(i): {"en": keys[i], "kind": seg[keys[i]]["kind"], "where": seg[keys[i]]["where"]} for i in todo},
                      open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("%s: %d to translate" % (lang, len(todo)))
    return 0


def cmd_pending_review(slug):
    keys, seg, ids = _slug_ids(slug)
    for lang in LANGS:
        mem = load_mem(lang)
        path = os.path.join(I18N, "work", "pendrev-%s-%s.json" % (slug, lang))
        if os.path.exists(path):
            os.remove(path)
        todo = [i for i in ids if mem.get(keys[i])]
        json.dump({str(i): {"en": keys[i], "tr": mem[keys[i]], "kind": seg[keys[i]]["kind"], "where": seg[keys[i]]["where"]} for i in todo},
                  open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("%s: %d to review" % (lang, len(todo)))
    return 0


def cmd_pending_status(slug):
    """Exit 0 only when every segment of the pending guide is translated in every language and passes the tag/number check."""
    keys, seg, ids = _slug_ids(slug, only_new=False)
    bad = 0
    for lang in LANGS:
        mem = load_mem(lang)
        miss = [keys[i] for i in ids if not mem.get(keys[i])]
        probs = 0
        for i in ids:
            k = keys[i]
            v = mem.get(k)
            if not v:
                continue
            if seg[k]["kind"] == "text" and skeleton(k) != skeleton(v):
                probs += 1
            if not numbers_ok(k, v):
                probs += 1
            if "[[CHECK" in v:
                probs += 1
        print("%s: %d missing, %d problems" % (lang, len(miss), probs))
        bad += len(miss) + probs
    return 1 if bad else 0


# ---------------------------------------------------------------- extract / merge / check
def cmd_extract():
    """Refresh segments.json. Ids are permanent: existing keys keep their position, new keys are appended."""
    cur = collect()
    path = os.path.join(I18N, "segments.json")
    old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    pend = load_pending()
    pending_keys = {k for p in pend.values() for k in p["keys"]}
    merged = {}
    for k, v in old.items():
        if k in cur:
            merged[k] = cur[k]
        elif k in pending_keys:
            merged[k] = v
        else:
            v = dict(v)
            v["stale"] = True
            merged[k] = v
    added = [k for k in cur if k not in old]
    for k in added:
        merged[k] = cur[k]
    os.makedirs(I18N, exist_ok=True)
    json.dump(merged, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    done = [slug for slug, p in pend.items() if all(k in cur for k in p["keys"] if k in pending_keys) and os.path.exists(os.path.join(ROOT, "guides", slug, "index.html"))]
    for slug in done:
        del pend[slug]
    if done:
        save_pending(pend)
    run_autofill(list(cur))
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


def cmd_review_prep(lang, min_id=0):
    segs = json.load(open(os.path.join(I18N, "segments.json"), encoding="utf-8"))
    keys = list(segs)
    mem = load_mem(lang)
    os.makedirs(os.path.join(I18N, "work"), exist_ok=True)
    for f in glob.glob(os.path.join(I18N, "work", "review-%s-*.json" % lang)):
        os.remove(f)
    ids = [i for i, k in enumerate(keys) if mem.get(k) and i >= min_id and not segs[k].get("stale")]
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
    run_autofill(list(seg))
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
    if a[0] == "extract-pending":
        return cmd_extract_pending(a[1], a[2], a[3] if len(a) > 3 else None)
    if a[0] == "pending-work":
        return cmd_pending_work(a[1])
    if a[0] == "pending-review":
        return cmd_pending_review(a[1])
    if a[0] == "pending-status":
        return cmd_pending_status(a[1])
    if a[0] == "extract-lang":
        return cmd_extract_lang(a[1:])
    if a[0] == "review-prep":
        return cmd_review_prep(a[1], int(a[2]) if len(a) > 2 else 0)
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
