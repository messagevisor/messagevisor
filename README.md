[![Messagevisor](./assets/banner.png)](https://messagevisor.com)

<div align="center">
  <h3><strong>Git-native i18n and l10n management solution</strong></h3>
</div>

<div align="center">
  <small>Manage your application copy, translations, and formatting declaratively from the comfort of your Git workflow.</small>
</div>

<div align="center">
  <h3>
    <a href="https://messagevisor.com">
      Website
    </a>
    <span> | </span>
    <a href="https://messagevisor.com/docs/quick-start">
      Documentation
    </a>
    <span> | </span>
    <a href="https://github.com/messagevisor/messagevisor/issues">
      Issues
    </a>
    <span> | </span>
    <a href="https://messagevisor.com/docs/contributing">
      Contributing
    </a>
    <span> | </span>
    <a href="https://github.com/messagevisor/messagevisor/blob/main/CHANGELOG.md">
      Changelog
    </a>
  </h3>
</div>

<div align="center">
  <sub>Built by
  <a href="https://twitter.com/fahad19">@fahad19</a>
</div>

---

## How does it work?

Three simple steps to visualize it:

1. Manage your Messagevisor [project](https://messagevisor.com/docs/projects) in a Git repository
1. Build and upload [datafiles](https://messagevisor.com/docs/building-datafiles) (static JSON files) to your CDN or custom server
1. Fetch the datafile, and start using the [SDK](https://messagevisor.com/docs/sdks/javascript) to evaluate translations and formatting

[![Messagevisor](./assets/flow.png)](https://messagevisor.com)

## What do I need to use Messagevisor?

- A Git repository for managing your [project](https://messagevisor.com/docs/projects) declaratively
- A CI/CD pipeline (like [GitHub Actions](https://messagevisor.com/docs/deployment/github-actions)) for building and uploading the [datafiles](https://messagevisor.com/docs/building-datafiles)
- A CDN or custom server for serving the generated [datafiles](https://messagevisor.com/docs/building-datafiles)

Messagevisor [SDKs](https://messagevisor.com/docs/sdks/javascript) will take care of the rest for you.

Learn more at [https://messagevisor.com](https://messagevisor.com).

## License

MIT © [Fahad Heylaal](https://fahad19.com)
