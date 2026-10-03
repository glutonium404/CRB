export const logger = {
  info: (...args) => {
    const time = new Date().toLocaleTimeString();
    console.log(`\x1b[36m[CRB INFO ${time}]\x1b[0m`, ...args);
  },
  success: (...args) => {
    const time = new Date().toLocaleTimeString();
    console.log(`\x1b[32m[CRB SUCCESS ${time}]\x1b[0m`, ...args);
  },
  warn: (...args) => {
    const time = new Date().toLocaleTimeString();
    console.warn(`\x1b[33m[CRB WARN ${time}]\x1b[0m`, ...args);
  },
  error: (...args) => {
    const time = new Date().toLocaleTimeString();
    console.error(`\x1b[31m[CRB ERROR ${time}]\x1b[0m`, ...args);
  },
  debug: (...args) => {
    if (process.env.DEBUG) {
      const time = new Date().toLocaleTimeString();
      console.log(`\x1b[90m[CRB DEBUG ${time}]\x1b[0m`, ...args);
    }
  }
};
