/**
 * Locks page scrolling while the menu is open. `overflow: hidden` on the body
 * is not enough here: the root element clips horizontally, so body overflow
 * never reaches the viewport, and iOS Safari keeps touch-scrolling the
 * document regardless. Fixing the body at its current offset works in both
 * cases; the offset is restored on unlock unless the route changed meanwhile.
 */
export function lockPageScroll(): () => void {
  const { body, documentElement: html } = document;
  const scrollY = window.scrollY;
  const scrollbarWidth = window.innerWidth - html.clientWidth;
  const lockedPath = window.location.pathname;
  const previous = {
    htmlOverflow: html.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  html.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `${-scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  return () => {
    html.style.overflow = previous.htmlOverflow;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.right = previous.right;
    body.style.width = previous.width;
    body.style.paddingRight = previous.paddingRight;

    if (window.location.pathname === lockedPath) {
      const previousBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollY);
      html.style.scrollBehavior = previousBehavior;
    }
  };
}
