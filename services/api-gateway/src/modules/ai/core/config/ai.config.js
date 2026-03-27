import config from "../../../../config/index.js";

export const aiConfig = {
  ...config.ai,
  openAiApiKey: config.secrets.openAiApiKey,
};

export default aiConfig;
