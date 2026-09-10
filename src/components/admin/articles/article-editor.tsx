"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import AdminButton from "@/components/admin/admin-button";
import ArticleDocView from "@/components/admin/articles/article-doc-view";
import { SelectField, TextField, TextareaField, inputClass } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { saveArticle } from "@/lib/admin/articles/actions";
import { emptyDoc, isDocEmpty, readingTimeLabel, slugify, type ArticleDoc } from "@/lib/admin/articles/doc";
import {
  articleStatusLabels,
  articleStatusOrder,
  articleStatusTone,
  isArticleStatus,
  seoGuidance,
  type Article,
} from "@/lib/admin/articles/types";
import { formatDateTime, isDateKey } from "@/lib/admin/format";
import FeaturedImageField from "@/components/admin/articles/featured-image-field";
import { getArticleDateLabel, getBlogCategoryLabel, type BlogCategory } from "@/lib/content/blog";

const categories: readonly BlogCategory[] = ["kosten", "seo", "webapplicaties", "performance"];

type Errors = Partial<Record<"title" | "slug" | "content" | "publishedAt" | "metaDescription", string>>;

function blank(): Article {
  return {
    id: "",
    title: "",
    slug: "",
    excerpt: "",
    content: emptyDoc,
    status: "draft",
    category: "kosten",
    updatedAt: new Date().toISOString(),
    seoTitle: "",
    metaDescription: "",
    featuredImage: null,
  };
}

function validate(article: Article, todayKey: string): Errors {
  const errors: Errors = {};
  if (article.title.trim().length < 3) errors.title = "Vul een titel in.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(article.slug)) errors.slug = "Alleen kleine letters, cijfers en koppeltekens.";
  if (isDocEmpty(article.content)) errors.content = "Het artikel heeft nog geen tekst.";
  if (article.publishedAt && !isDateKey(article.publishedAt)) errors.publishedAt = "Dit is geen geldige datum.";
  if (article.status === "published" && !article.publishedAt) errors.publishedAt = "Een gepubliceerd artikel heeft een publicatiedatum.";
  if (article.status === "published" && article.publishedAt && article.publishedAt > todayKey) errors.publishedAt = "De publicatiedatum ligt in de toekomst.";
  return errors;
}

/** Character guidance for SEO fields: a range, not a hard limit. */
function Guidance({ length, min, max }: { length: number; min: number; max: number }) {
  const state = length === 0 ? "leeg" : length < min ? "kort" : length > max ? "lang" : "goed";
  return (
    <span className={`tabular ${state === "goed" ? "text-success" : state === "leeg" ? "text-faint" : "text-danger"}`}>
      {length} tekens{state === "kort" ? `, richtlijn ${min}–${max}` : state === "lang" ? `, richtlijn tot ${max}` : ""}
    </span>
  );
}

type ToolbarProps = { editor: Editor | null };

function Toolbar({ editor }: ToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const linkId = "article-link-url";
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            h2: instance.isActive("heading", { level: 2 }),
            h3: instance.isActive("heading", { level: 3 }),
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            link: instance.isActive("link"),
            bullet: instance.isActive("bulletList"),
            ordered: instance.isActive("orderedList"),
            quote: instance.isActive("blockquote"),
            undo: instance.can().undo(),
            redo: instance.can().redo(),
            href: (instance.getAttributes("link").href as string | undefined) ?? "",
          }
        : null,
  });

  if (!editor || !state) return null;

  const button = (label: string, active: boolean, onClick: () => void, text: string, disabled = false) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`min-h-9 min-w-9 rounded-xs px-2 text-[0.85rem] font-medium transition-colors disabled:opacity-35 ${
        active ? "bg-ink text-paper" : "text-ink hover:bg-paper-deep"
      }`}
    >
      {text}
    </button>
  );

  const openLink = () => {
    setLinkValue(state.href);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = linkValue.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const url = /^(https?:\/\/|\/|mailto:)/.test(href) ? href : `https://${href}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
  };

  return (
    <div className="border-b border-line">
      <div role="toolbar" aria-label="Opmaak" className="flex flex-wrap items-center gap-0.5 p-1.5">
        {button("Kop 2", state.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2")}
        {button("Kop 3", state.h3, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3")}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        {button("Vet", state.bold, () => editor.chain().focus().toggleBold().run(), "B")}
        {button("Cursief", state.italic, () => editor.chain().focus().toggleItalic().run(), "I")}
        {button("Link", state.link, openLink, "Link")}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        {button("Opsomming", state.bullet, () => editor.chain().focus().toggleBulletList().run(), "• Lijst")}
        {button("Genummerde lijst", state.ordered, () => editor.chain().focus().toggleOrderedList().run(), "1. Lijst")}
        {button("Citaat", state.quote, () => editor.chain().focus().toggleBlockquote().run(), "Citaat")}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        {button("Ongedaan maken", false, () => editor.chain().focus().undo().run(), "↶", !state.undo)}
        {button("Opnieuw", false, () => editor.chain().focus().redo().run(), "↷", !state.redo)}
      </div>
      {linkOpen ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-line bg-surface p-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={linkId} className="label-mono mb-1.5 block">
              Linkadres
            </label>
            <input
              id={linkId}
              type="url"
              value={linkValue}
              onChange={(event) => setLinkValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
                if (event.key === "Escape") setLinkOpen(false);
              }}
              placeholder="https://… of /nl/diensten"
              autoFocus
              className={`${inputClass} min-h-10 py-1.5`}
            />
          </div>
          <AdminButton onClick={applyLink}>{linkValue.trim() ? "Link instellen" : "Link verwijderen"}</AdminButton>
          <AdminButton variant="secondary" onClick={() => setLinkOpen(false)}>
            Annuleren
          </AdminButton>
        </div>
      ) : null}
    </div>
  );
}

type ArticleEditorProps = {
  /** The stored article, or null for a new one. */
  stored: Article | null;
  todayKey: string;
};

/**
 * What the save button does, said plainly. Saving with the status on
 * "Gepubliceerd" puts the article on the public site, so the button may not
 * keep calling it a concept.
 */
function saveLabel(id: string | null | undefined, status: string): string {
  if (status === "published") {
    return id ? "Publicatie bijwerken" : "Publiceren";
  }
  return id ? "Concept bijwerken" : "Concept aanmaken";
}

export default function ArticleEditor({ stored, todayKey }: ArticleEditorProps) {
  const router = useRouter();
  const [article, setArticle] = useState<Article>(() => stored ?? blank());
  const [slugTouched, setSlugTouched] = useState(Boolean(stored?.slug));
  const [errors, setErrors] = useState<Errors>({});
  const [view, setView] = useState<"edit" | "preview">("edit");
  const { save: runSave, pending, error: saveError, savedAt } = useSave();
  // Static ids: useId() diverges between server and client around the Tiptap editor.
  const contentId = "article-content";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
        // Not part of the article model: keep the document to what the site renders.
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
      }),
    ],
    content: article.content,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "adm-editor", "aria-label": "Artikeltekst", "aria-describedby": `${contentId}-help` },
    },
    onUpdate: ({ editor: instance }) => {
      setArticle((previous) => ({ ...previous, content: instance.getJSON() as ArticleDoc }));
      setErrors((previous) => (previous.content ? { ...previous, content: undefined } : previous));
    },
  });

  const update = useCallback(<K extends keyof Article>(field: K, value: Article[K]) => {
    setArticle((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => (field in previous ? { ...previous, [field]: undefined } : previous));
  }, []);

  function save() {
    const next: Article = {
      ...article,
      title: article.title.trim(),
      slug: article.slug || slugify(article.title),
      seoTitle: article.seoTitle.trim() || `${article.title.trim()} | YM Creations`,
      updatedAt: new Date().toISOString(),
    };
    const nextErrors = validate(next, todayKey);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      (first === "content" ? editor?.view.dom : document.getElementById(first))?.focus();
      return;
    }
    const isNew = !next.id;
    setArticle(next);

    runSave(
      () =>
        saveArticle(next.id || null, {
          title: next.title,
          slug: next.slug,
          excerpt: next.excerpt,
          content: next.content,
          status: next.status,
          category: next.category,
          author: next.author,
          publishedAt: next.publishedAt,
          seoTitle: next.seoTitle,
          metaDescription: next.metaDescription,
          featuredImage: next.featuredImage ?? null,
        }),
      (savedId: string) => {
        if (isNew) router.push(`/admin/artikelen/${savedId}`);
      },
    );
  }

  const words = article.content ? readingTimeLabel(article.content) : "1 min";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div role="tablist" aria-label="Weergave" className="flex gap-1 rounded-sm border border-line bg-surface p-1">
          {(["edit", "preview"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              onClick={() => setView(tab)}
              className={`rounded-xs px-3 py-1.5 text-[0.88rem] font-medium transition-colors ${
                view === tab ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              {tab === "edit" ? "Bewerken" : "Voorbeeld"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={articleStatusTone[article.status]}>{articleStatusLabels[article.status]}</StatusBadge>
          {savedAt ? <span className="text-[0.85rem] text-muted">Opgeslagen {formatDateTime(savedAt)}</span> : null}
          <AdminButton onClick={save} disabled={pending}>
            {pending ? "Opslaan…" : saveLabel(article.id, article.status)}
          </AdminButton>
        </div>
      </div>

      {Object.values(errors).filter(Boolean).length > 0 ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.9rem] text-danger">
          Controleer de gemarkeerde velden.
        </p>
      ) : null}

      {saveError ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.9rem] text-danger">
          {saveError}
        </p>
      ) : null}

      {view === "preview" ? (
        <div role="tabpanel" className="rounded-sm border border-line bg-paper px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-[44rem]">
            <p className="label-mono flex flex-wrap gap-x-3 gap-y-1">
              <span>Inzichten</span>
              <span>{getBlogCategoryLabel("nl", article.category)}</span>
              {article.publishedAt && isDateKey(article.publishedAt) ? <span>{getArticleDateLabel("nl", article.publishedAt)}</span> : null}
              <span>{words}</span>
              {article.author ? <span>{article.author}</span> : null}
            </p>
            <h1 className="display-lg mt-5">{article.title || "Zonder titel"}</h1>
            {article.excerpt ? <p className="lede reading mt-6">{article.excerpt}</p> : null}
            <div className="mt-10 border-t border-line pt-8">
              <ArticleDocView doc={article.content} />
            </div>
          </div>
        </div>
      ) : (
        <div role="tabpanel" className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
          <div className="space-y-6">
            <TextField
              id="title"
              label="Titel"
              value={article.title}
              onChange={(event) => {
                update("title", event.target.value);
                if (!slugTouched) update("slug", slugify(event.target.value));
              }}
              error={errors.title}
              className="text-[1.15rem] font-semibold"
            />
            <TextField
              id="slug"
              label="Slug"
              value={article.slug}
              onChange={(event) => {
                setSlugTouched(true);
                update("slug", slugify(event.target.value.replace(/\s+/g, "-")) || event.target.value.toLowerCase());
              }}
              error={errors.slug}
              hint={`Adres wordt /nl/blog/${article.slug || "…"}`}
              className="font-mono text-[0.9rem]"
            />
            <TextareaField
              id="excerpt"
              label="Introductie"
              optional
              value={article.excerpt}
              onChange={(event) => update("excerpt", event.target.value)}
              hint="Staat als lede onder de titel en als samenvatting in het overzicht."
              className="min-h-20"
            />
            <div>
              <div className="label-mono mb-1.5 flex items-baseline justify-between gap-3">
                <span id={`${contentId}-label`}>Tekst</span>
                <span className="normal-case tracking-normal text-faint">{words} leestijd</span>
              </div>
              <div className={`rounded-sm border bg-surface ${errors.content ? "border-danger" : "border-line focus-within:border-ink"}`}>
                <Toolbar editor={editor} />
                {editor ? <EditorContent editor={editor} /> : <div className="adm-editor" aria-hidden="true" />}
              </div>
              <p id={`${contentId}-help`} className="mt-1.5 text-[0.82rem] text-muted">
                Sneltoetsen: Ctrl/⌘+B vet, Ctrl/⌘+I cursief, Ctrl/⌘+Z ongedaan maken. Begin een regel met &quot;- &quot; voor een opsomming of &quot;## &quot; voor een kop.
              </p>
              {errors.content ? <p className="mt-1.5 text-[0.85rem] text-danger">{errors.content}</p> : null}
            </div>
          </div>

          <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
            <section aria-labelledby="publish-heading" className="space-y-4">
              <h2 id="publish-heading" className="label-mono text-ink">
                Publicatie
              </h2>
              <SelectField id="status" label="Status" value={article.status} onChange={(event) => (isArticleStatus(event.target.value) ? update("status", event.target.value) : null)}>
                {articleStatusOrder.map((value) => (
                  <option key={value} value={value}>
                    {articleStatusLabels[value]}
                  </option>
                ))}
              </SelectField>
              <TextField id="publishedAt" label="Publicatiedatum" optional type="date" min="2000-01-01" max="2100-12-31" value={article.publishedAt ?? ""} onChange={(event) => update("publishedAt", event.target.value || undefined)} error={errors.publishedAt} />
              <SelectField id="category" label="Categorie" value={article.category} onChange={(event) => update("category", event.target.value as BlogCategory)}>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {getBlogCategoryLabel("nl", value)}
                  </option>
                ))}
              </SelectField>
              <TextField id="author" label="Auteur" optional value={article.author ?? ""} onChange={(event) => update("author", event.target.value || undefined)} />
              <p className="text-[0.82rem] leading-snug text-muted">
                Status en artikel worden opgeslagen in de database, en de website leest ze daar. Gepubliceerd betekent zichtbaar op /nl/blog; concept betekent nergens publiek te vinden.
              </p>
            </section>

            <section aria-labelledby="seo-heading" className="space-y-4 border-t border-line pt-6">
              <h2 id="seo-heading" className="label-mono text-ink">
                SEO
              </h2>
              <TextField id="seoTitle" label="SEO-titel" optional value={article.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} placeholder={article.title ? `${article.title} | YM Creations` : "Titel | YM Creations"} />
              <p className="-mt-2 text-[0.82rem]">
                <Guidance length={article.seoTitle.length} min={seoGuidance.title.min} max={seoGuidance.title.max} />
              </p>
              <TextareaField id="metaDescription" label="Metabeschrijving" optional value={article.metaDescription} onChange={(event) => update("metaDescription", event.target.value)} className="min-h-24" />
              <p className="-mt-2 text-[0.82rem]">
                <Guidance length={article.metaDescription.length} min={seoGuidance.description.min} max={seoGuidance.description.max} />
              </p>
            </section>

            <FeaturedImageField
              value={article.featuredImage ?? null}
              onChange={(value) => update("featuredImage", value)}
            />

          </aside>
        </div>
      )}
    </div>
  );
}
