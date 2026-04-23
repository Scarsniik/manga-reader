declare const __APP_PRODUCT_NAME__: string;

export const APP_PRODUCT_NAME = typeof __APP_PRODUCT_NAME__ === "string" && __APP_PRODUCT_NAME__.trim()
    ? __APP_PRODUCT_NAME__.trim()
    : "Scaramanga";
