const info = (...args) => {
    console.info(...args);
};
const warn = (...args) => {
    console.warn(...args);
};
const error = (...args) => {
    console.error(...args);
};
const debug = (...args) => {
    if (process.env.NODE_ENV !== "production") {
        console.debug(...args);
    }
};
export const withPrefix = (prefix) => {
    return {
        debug: (...args) => debug(prefix, ...args),
        error: (...args) => error(prefix, ...args),
        info: (...args) => info(prefix, ...args),
        warn: (...args) => warn(prefix, ...args)
    };
};
export default {
    debug,
    error,
    info,
    warn
};
