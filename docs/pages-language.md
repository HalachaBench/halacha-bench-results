# Pages language selection

The HTML starts in Hebrew with `lang="he"`, `dir="rtl"` and the Hebrew view visible.
English is shown only for a supported explicit choice or an English primary browser locale.

## Precedence

1. A supported `#lang=he` or `#lang=en` fragment is the explicit language choice.
2. A supported `?lang=he` or `?lang=en` query is used if there is no supported fragment.
   On `htmlpreview.github.io`, the query inside the preview's source URL is read instead.
3. The **primary** browser locale selects English only when it is `en` or an `en-*` locale
   such as `en-US` or `en-GB`. Later fallback languages do not override the primary locale.
4. Everything else, including missing or unsupported locales, defaults to Hebrew.

Language matching is case-insensitive and accepts regional tags and the legacy Hebrew `iw`
alias. Unsupported URL choices are ignored and selection continues down the precedence list.
A fragment wins over a conflicting query, so toggling remains stable after reload.

## Switching and previews

The language links switch views without reloading, preserve the current section and update
only `#lang=...`. Browser Back/Forward restores the language choice. Every change updates
both the page language and direction, including RTL for Hebrew.

Direct examples: `index.html?lang=en`, `index.html?lang=he`, `index.html#lang=he`.

For HTMLPreview, append the language fragment **after the full source URL**:

`https://htmlpreview.github.io/?https://github.com/OWNER/REPO/blob/COMMIT/index.html#lang=he`

Do not append a standalone `&lang=...` to that wrapper: its entire query is the source URL.
Language links are rebuilt from the actual outer page URL, so the wrapper's injected base
cannot send the user to a raw source file. The preview remains a third-party preview, not
a GitHub Pages deployment.

## Regression checks

Run `node --test tests/test_pages_language.cjs` from the repository root. These dependency-free
checks execute the actual inline script with a small DOM fixture and cover default language,
supported locales, URL precedence, nested preview queries, toggles, RTL and Back/Forward.
They complement browser checks; they do not replace visual or responsive-layout review.
