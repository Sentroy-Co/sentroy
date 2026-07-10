import React, { useRef, useState, useEffect, useMemo } from 'react';
import { EditorEvent, Events, Editor as HugeRTEEditor } from 'hugerte';
import { Editor } from '@hugerte/hugerte-react';
import { Button } from '@workspace/ui/components/button';
import { CodeEditor } from '@workspace/ui/components/code-editor';
import { CodeIcon as Code, EyeIcon as Eye } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTheme } from 'next-themes';
// Hugerte editör bileşeni özellikleri
interface HugerteEditorProps {
  initialValue?: string;
  onEditorChange?: (content: string) => void;
  onInit?: (evt: unknown, editor: HugeRTEEditor) => void;
  height?: number | string;
  placeholder?: string;
  disabled?: boolean;
  inline?: boolean;
  toolbar?: string;
  plugins?: string;
  menubar?: boolean | string;
  statusbar?: boolean;
  className?: string;
  apiKey?: string;
  theme?: string;
  showHtmlToggle?: boolean;
}

const HugerteEditor: React.FC<HugerteEditorProps> = ({
  initialValue = '',
  onEditorChange,
  onInit,
  height = 500,
  placeholder = '',
  disabled = false,
  inline = false,
  toolbar = 'forecolor backcolor removeformat | blocks fontfamily fontsize | bold italic underline strikethrough | link image media table mergetags | addcomment showcomments | spellcheckdialog a11ycheck typography | align lineheight | checklist numlist bullist indent outdent | emoticons charmap | removeformat wordcount |  undo redo ',
  plugins = 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table code help wordcount ', /*[
    // Core editing features
    'anchor', 'autolink', 'charmap', 'codesample', 'emoticons', 'image', 'link', 'lists', 'media', 'searchreplace', 'table', 'visualblocks', 'wordcount',
    // Your account includes a free trial of TinyMCE premium features
    // Try the most popular premium features until Mar 23, 2025:
    'checklist', 'mediaembed', 'casechange', 'export', 'formatpainter', 'pageembed', 'a11ychecker', 'tinymcespellchecker', 'permanentpen', 'powerpaste', 'advtable', 'advcode', 'editimage', 'advtemplate', 'ai', 'mentions', 'tinycomments', 'tableofcontents', 'footnotes', 'mergetags', 'autocorrect', 'typography', 'inlinecss', 'markdown','importword', 'exportword', 'exportpdf'
  ],*/
  menubar = ' insert format tools', // file edit view table
  statusbar = false,
  className,
  showHtmlToggle = false
}) => {
  const editorRef = useRef<HugeRTEEditor | null>(null);
  const [editorInitialized, setEditorInitialized] = useState(false);
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [htmlContent, setHtmlContent] = useState(initialValue);
  const { theme: th, systemTheme } = useTheme();
  const theme = th === 'system' ? systemTheme : th;

  const handleInit = (evt: unknown, editor: HugeRTEEditor) => {
    editorRef.current = editor;
    setEditorInitialized(true);
    
    if (onInit) {
      onInit(evt, editor);
    }
  };

  const handleEditorChange = (content: string, editor: HugeRTEEditor) => {
    setHtmlContent(content);
    if (onEditorChange) {
      onEditorChange(content);
    }
  };

  const toggleHtmlMode = () => {
    if (isHtmlMode && editorRef.current) {
      // Switching from HTML to visual mode
      editorRef.current.setContent(htmlContent);
    } else if (editorRef.current) {
      // Switching from visual to HTML mode
      setHtmlContent(editorRef.current.getContent());
    }
    setIsHtmlMode(!isHtmlMode);
  };

  const handleHtmlChange = (newContent: string) => {
    setHtmlContent(newContent);
    if (onEditorChange) {
      onEditorChange(newContent);
    }
  };

  // Get custom CSS path based on theme
  const getCustomContentCss = () => {
    return theme === 'dark' 
      ? '/css/tiny-editor-dark.css' 
      : '/css/tiny-editor-light.css';
  };

  // Custom colors for the editor toolbar that match the app theme
  const getContentStyle = () => {
    return {
      backgroundColor: theme === 'dark' ? 'oklch(0.145 0 0)' : 'oklch(1 0 0)',
      color: theme === 'dark' ? 'oklch(0.985 0 0)' : 'oklch(0.145 0 0)',
      borderRadius: 'var(--radius)',
      borderColor: theme === 'dark' ? 'oklch(1 0 0 / 10%)' : 'oklch(0.922 0 0)'
    };
  };

  return (
    <div className={className}>
      {showHtmlToggle && (
        <div className="flex justify-end mb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleHtmlMode}
            className="flex items-center gap-1"
          >
            {isHtmlMode ? <HugeiconsIcon icon={Eye} strokeWidth={2} className="size-4" /> : <HugeiconsIcon icon={Code} strokeWidth={2} className="size-4" />}
            {isHtmlMode ? "Edit Mode" : "HTML Mode"}
          </Button>
        </div>
      )}
    
      {isHtmlMode ? (
        // maxHeight = height: HTML mode'da kod wrapper'ı `height` ile sabit
        // tavanda kapanır, uzun içerik internal scroll edilir. Önceki
        // sürümde sadece `minHeight` vardı, içerik büyüdükçe wrapper da
        // büyüyor ve dialog/scroll layout'unu eziyordu (özellikle
        // template editor'de iframe preview'in kapladığı alanı taşırıyordu).
        <CodeEditor
          value={htmlContent}
          onChange={handleHtmlChange}
          disabled={disabled}
          placeholder={placeholder}
          minHeight={height}
          maxHeight={height}
        />
      ) : (
        <Editor
          onInit={handleInit}
          init={{
            height,
            plugins,
            toolbar,
            inline,
            statusbar,
            placeholder,
            branding: false,
            promotion: false,
            // Hugerte default'u kullanıcının yazdığı <iframe>'lere sandbox
            // attribute'u ekliyor → preview'da "Blocked script execution
            // in 'about:blank'" console hatası. Email template'lerinde
            // iframe zaten kullanılmaz; biz preview iframe'lerimizde
            // (sanitizeEmailHtml) bunları zaten strip ediyoruz, çift
            // sandbox'a gerek yok.
            sandbox_iframes: false,
            menubar: menubar as string | boolean,
            skin: theme === 'dark' ? 'oxide-dark' : 'oxide',
            content_css: getCustomContentCss(),
            content_style: `
              body { 
                font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                padding: 1rem;
                border-radius: var(--radius);
                border-width: 1px; 
              }
              .mce-content-body[data-mce-placeholder]:not(.mce-visualblocks)::before {
                color: ${theme === 'dark' ? 'var(--muted-foreground)' : 'var(--background-foreground)'};
                padding: 15px;
                font-style: italic;
              }
              
            `,
            setup: (editor: HugeRTEEditor) => {
              editor.on('init', () => {
                if (initialValue !== '' && initialValue !== undefined) {
                  editor.setContent(initialValue);
                }
              });
            }
          }}
          value={initialValue}
          onEditorChange={handleEditorChange}
          disabled={disabled}
        />
      )}
    </div>
  );
};

export default HugerteEditor;
