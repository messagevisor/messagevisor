const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  sourceLocale: "en",
  modules: [createICUModule()],
  // icuSkeleton: true,
  // namespaceCharacter: "_",
};
