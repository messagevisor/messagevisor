const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
  sets: true,
};
