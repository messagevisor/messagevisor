const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  sourceLocale: "en",
  modules: [createICUModule()],
};
