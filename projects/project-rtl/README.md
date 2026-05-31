# project-rtl

This project demonstrates how Messagevisor works with one LTR locale (`en-US`) and one RTL locale (`ar-SA`).

## What already works

- Arabic translations can be authored directly in locale files.
- Locale-specific number, currency, date, and time formats work through the normal ICU module path.
- `messagevisor test`, `messagevisor build`, `messagevisor examples`, and catalog generation all work with RTL content.
- Mixed-script translations can include LTR product names and URLs inside Arabic copy.
- Locale direction metadata can now be authored directly in locales via `direction: ltr` or `direction: rtl`.
- Built datafiles, SDK snapshots, and catalog exports now carry that direction metadata forward.

## Likely future adaptation points

- surface direction more prominently in app integrations that consume Messagevisor datafiles
- extend non-JavaScript SDKs to expose the same locale direction metadata ergonomically
- keep improving mixed-script presentation, especially around links, numbers, and brand names inside RTL copy
