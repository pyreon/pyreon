export type IsRocketComponent = <T>(component: T) => boolean;

/** Runtime type guard — checks if a component was created by `rocketstyle()`. */
const isRocketComponent: IsRocketComponent = (component) => {
  if (
    component &&
    (typeof component === "object" || typeof component === "function") &&
    Object.hasOwn(component as object, "IS_ROCKETSTYLE")
  ) {
    return true;
  }

  return false;
};

export default isRocketComponent;
