declare module "*.css";
declare module "*.scss";
declare module "*.sass";

declare module "*.md?raw" {
  const content: string;

  export default content;
}
