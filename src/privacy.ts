/**
 * Privacy rules for text taken from the page.
 *
 * Element text is never captured unless the tracking plan opts in per
 * click (`track.clicks[].captureText: true`). Even then, text is never
 * taken from form fields, editable regions or masked subtrees, because
 * those are where customer content and typed values live.
 */

/** Attributes that mark a subtree whose text must never leave the page. */
export const MASK_SELECTOR = "[data-tflo-mask], [data-jz-mask]";

/** Maximum characters of element text kept on a record. */
export const MAX_CAPTURED_TEXT = 80;

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION"]);

/** Editable regions, by attribute (works where `isContentEditable` is not implemented). */
const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';

/** Whether `el` itself must not contribute text: a form field, editable or masked. */
function excluded(el: Element): boolean {
    if (FORM_TAGS.has(el.tagName)) return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return el.matches(EDITABLE_SELECTOR) || el.matches(MASK_SELECTOR);
}

/**
 * The text a click record may carry for `el`, or `null` when none is safe.
 *
 * Returns `null` when `el` is itself excluded or sits inside a masked or
 * editable region. Otherwise it joins the text of `el`'s descendants,
 * skipping every excluded subtree, collapses whitespace and keeps at most
 * `MAX_CAPTURED_TEXT` characters.
 */
export function capturableText(el: Element): string | null {
    if (excluded(el) || el.closest(MASK_SELECTOR) || el.closest(EDITABLE_SELECTOR)) return null;

    const parts: string[] = [];
    const walk = (node: Node): void => {
        for (let child = node.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === 3) {
                parts.push(child.nodeValue ?? "");
            } else if (child.nodeType === 1 && !excluded(child as Element)) {
                walk(child);
            }
        }
    };
    walk(el);

    const text = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_CAPTURED_TEXT);
    return text === "" ? null : text;
}
