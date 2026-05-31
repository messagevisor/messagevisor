const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
  parser: "json",
};
