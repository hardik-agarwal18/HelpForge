import dotenv from "dotenv";

dotenv.config();

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  database: {
    url: process.env.DATABASE_URL,
    readUrl: process.env.DATABASE_READ_URL,
    testUrl: process.env.DATABASE_URL_TEST,
  },

  jwtSecret: process.env.JWT_SECRET,

  services: {
    chatbot: process.env.CHATBOT_SERVICE_URL,
    notification: process.env.NOTIFICATION_SERVICE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  kafka: {
    broker: process.env.KAFKA_BROKER,
  },
};

export default config;
