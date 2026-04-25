// @ts-nocheck
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Quote, Code, Image, Link,
} from 'lucide-react';

interface ToolbarProps {
  editor: Editor | null;
  onInsertImageUrl?: () => void;
}

const FONTS = [
  { label: 'Default', value: '' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'monospace' },
  { label: 'Inter', value: 'Inter, sans-serif' },
];

export function Toolbar({ editor, onInsertImageUrl }: ToolbarProps) {
  if (!editor) return <div className="h-10 border-b border-gray-700 bg-gray-800" />;

  const btn = (active: boolean) =>
    `p-2 rounded transition-colors ${active ? 'bg-[#7c3aed] text-white' : 'hover:bg-gray-700'}`;

  const handleInsertLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  const handleInsertImageUrl = () => {
    if (onInsertImageUrl) {
      onInsertImageUrl();
    } else {
      const url = window.prompt('Image URL:');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-700 bg-gray-800 flex-wrap">
      {/* Heading select */}
      <select
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            editor.chain().focus().setParagraph().run();
          } else {
            editor.chain().focus().toggleHeading({ level: parseInt(v) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
          }
          e.target.value = '';
        }}
        className="bg-gray-700 text-sm px-2 py-1 rounded border-none outline-none cursor-pointer"
        value=""
      >
        <option value="">Text</option>
        <option value="1">H1</option>
        <option value="2">H2</option>
        <option value="3">H3</option>
        <option value="4">H4</option>
        <option value="5">H5</option>
        <option value="6">H6</option>
      </select>

      {/* Font family select */}
      <select
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            editor.chain().focus().unsetFontFamily().run();
          } else {
            editor.chain().focus().setFontFamily(v).run();
          }
        }}
        className="bg-gray-700 text-sm px-2 py-1 rounded border-none outline-none cursor-pointer"
        defaultValue=""
      >
        {FONTS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      {/* Text format */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive('bold'))}
        title="Bold (Ctrl+B)"
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive('italic'))}
        title="Italic (Ctrl+I)"
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btn(editor.isActive('underline'))}
        title="Underline"
      >
        <Underline size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btn(editor.isActive('strike'))}
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      {/* Alignment */}
      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={btn(editor.isActive({ textAlign: 'left' }))}
        title="Align Left"
      >
        <AlignLeft size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={btn(editor.isActive({ textAlign: 'center' }))}
        title="Align Center"
      >
        <AlignCenter size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={btn(editor.isActive({ textAlign: 'right' }))}
        title="Align Right"
      >
        <AlignRight size={16} />
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      {/* Lists */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive('bulletList'))}
        title="Bullet List"
      >
        <List size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive('orderedList'))}
        title="Numbered List"
      >
        <ListOrdered size={16} />
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      {/* Blocks */}
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btn(editor.isActive('blockquote'))}
        title="Blockquote"
      >
        <Quote size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={btn(editor.isActive('codeBlock'))}
        title="Code Block"
      >
        <Code size={16} />
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      {/* Insert */}
      <button
        onClick={handleInsertImageUrl}
        className="p-2 hover:bg-gray-700 rounded transition-colors"
        title="Insert Image by URL"
      >
        <Image size={16} />
      </button>
      <button
        onClick={handleInsertLink}
        className={btn(editor.isActive('link'))}
        title="Insert Link"
      >
        <Link size={16} />
      </button>
    </div>
  );
}
