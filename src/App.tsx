import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  Code2,
  FileCheck2,
  FileText,
  FileUp,
  Github,
  GripVertical,
  LayoutTemplate,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { demo } from '../shared/demo';
import {
  defaultDesign,
  MAX_TEXT,
  resumeSchema,
  type Design,
  type ImportResult,
  type Resume,
} from '../shared/schema';
import { renderDocument } from '../shared/render';

type Tab = 'upload' | 'content' | 'design';
const copyDemo = () => structuredClone(demo);
const tabs = [
  { id: 'upload', label: 'Yükle', icon: Upload },
  { id: 'content', label: 'İçerik', icon: FileText },
  { id: 'design', label: 'Tasarım', icon: LayoutTemplate },
] as const;

function Preview({ resume, design }: { resume: Resume; design: Design }) {
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.75);
  const [height, setHeight] = useState(1123);
  const html = useMemo(() => renderDocument(resume, design), [resume, design]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(entry.contentRect.width / 794, 1)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="preview-width" ref={container}>
      <div className="paper" style={{ width: 794 * scale, height: height * scale }}>
        <iframe
          ref={frame}
          title="CV önizlemesi"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={html}
          onLoad={() =>
            setHeight(
              Math.max(
                1123,
                Math.ceil(
                  frame.current?.contentDocument?.body.getBoundingClientRect().height ?? 1123,
                ),
              ),
            )
          }
          style={{ width: 794, height, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [resume, setResume] = useState<Resume>(copyDemo);
  const [design, setDesign] = useState<Design>(defaultDesign);
  const [tab, setTab] = useState<Tab>('upload');
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'tex' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [ollama, setOllama] = useState<{ available: boolean; model: string; reason?: string }>({
    available: false,
    model: 'llama3.2',
  });
  const [health, setHealth] = useState<'loading' | 'ready' | 'error'>('loading');
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const totalWords = useMemo(
    () =>
      [resume.name, resume.headline, ...resume.sections.map((s) => s.content)]
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length,
    [resume],
  );

  async function checkHealth() {
    setHealth('loading');
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setOllama(data.ollama);
      setHealth('ready');
    } catch {
      setHealth('error');
    }
  }
  useEffect(() => {
    void checkHealth();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  function updateResume(value: Resume) {
    setResume(value);
    setDirty(true);
  }
  function updateSection(id: string, patch: Partial<Resume['sections'][number]>) {
    updateResume({
      ...resume,
      sections: resume.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  function moveSection(index: number, direction: number) {
    const sections = [...resume.sections];
    [sections[index], sections[index + direction]] = [sections[index + direction], sections[index]];
    updateResume({ ...resume, sections });
  }
  function loadDemo() {
    if (dirty && !window.confirm('Mevcut düzenlemelerin yerine örnek CV yüklensin mi?')) return;
    setResume(copyDemo());
    setSourceText('');
    setSourceName('');
    setWarnings([]);
    setError('');
    setDirty(false);
    setMethod('');
    setNotice('Kurmaca örnek CV yüklendi. İçerik ve tasarımı değiştirebilirsin.');
  }

  async function importCv(file?: File) {
    if (busy) return;
    setError('');
    if (file && !/\.(pdf|docx|txt|tex|md)$/i.test(file.name)) {
      setError('PDF, DOCX, TXT, TEX veya Markdown dosyası yükle.');
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setError('Dosya en fazla 10 MB olabilir.');
      return;
    }
    if (!file && paste.trim().length < 20) {
      setError('Lütfen en az 20 karakter içeren bir CV metni yapıştır.');
      return;
    }
    if (dirty && !window.confirm('Mevcut düzenlemelerin yerine yüklediğin CV işlensin mi?')) return;
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 150_000);
    setBusy(true);
    try {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('useAi', String(useAi));
        body = form;
      } else {
        body = JSON.stringify({ text: paste, useAi });
        headers = { 'Content-Type': 'application/json' };
      }
      const response = await fetch('/api/import', {
        method: 'POST',
        body,
        headers,
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'CV okunamadı.');
      const result = data as ImportResult;
      setResume(result.resume);
      setSourceText(result.sourceText);
      setSourceName(file?.name || 'Yapıştırılan metin');
      setWarnings(result.warnings);
      setMethod(result.method);
      setDirty(true);
      setTab('content');
      setNotice('CV’n hazır. İndirmeden önce çıkarılan bilgileri kontrol et.');
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'AbortError'
          ? 'İşlem iptal edildi veya süre sınırına ulaştı. Tekrar deneyebilirsin.'
          : err instanceof TypeError
            ? 'Yerel sunucuya bağlanılamadı. npm run dev komutunun çalıştığını kontrol et.'
            : err instanceof Error
              ? err.message
              : 'CV işlenemedi.',
      );
    } finally {
      clearTimeout(timer);
      controller.current = null;
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function download(format: 'pdf' | 'tex') {
    if (exporting) return;
    setError('');
    if (!resume.name.trim()) {
      setError('İndirmeden önce İçerik sekmesinden ad soyadını ekle.');
      setTab('content');
      return;
    }
    if (!resume.sections.some((s) => s.content.trim())) {
      setError('CV’ye en az bir bölüm ekle.');
      setTab('content');
      return;
    }
    const cleaned = { ...resume, contacts: resume.contacts.map((c) => c.trim()).filter(Boolean) };
    if (cleaned.contacts.length > 12 || cleaned.contacts.some((c) => c.length > 400)) {
      setError('İletişim bilgileri en fazla 12 satır, her satır en fazla 400 karakter olabilir.');
      setTab('content');
      return;
    }
    if (!resumeSchema.safeParse(cleaned).success) {
      setError(
        'CV toplamda en fazla 80.000 karakter ve 24 bölüm içerebilir. Alan uzunluklarını kontrol et.',
      );
      setTab('content');
      return;
    }
    setExporting(format);
    try {
      const response = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: cleaned, design }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'İndirme başarısız.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${
        resume.name
          .replace(/[^\p{L}\p{N} -]/gu, '')
          .trim()
          .replace(/\s+/g, '-') || 'resume'
      }-CV.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(
        format === 'pdf'
          ? 'PDF hazır; indirme başlatıldı.'
          : 'LaTeX hazır. Overleaf’te derleyici olarak XeLaTeX seç.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dosya indirilemedi.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="/"
          onClick={(event) => event.preventDefault()}
          aria-label="Make CV Great Again"
        >
          <span className="brand-icon">
            <FileText size={23} strokeWidth={1.8} />
          </span>
          <span>
            makecv<span className="brand-light">greatagain</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <div className="header-actions">
          <span className="local-pill">
            <span /> Localhost
          </span>
          <a
            className="github-link"
            href="https://github.com/erdembeler/makecvgreatagain"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={17} />
            <span>GitHub</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </header>

      <main>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              <span /> KENDİ BİLGİSAYARINDA. SENİN KONTROLÜNDE.
            </div>
            <h1>
              Bir sonraki adımın için, <span>daha iyi bir CV.</span>
            </h1>
            <p>CV’ni yükle. İçeriğini düzenle. İyi bir ilk izlenim bırak.</p>
          </div>
          <span className="studio-label">
            <Monitor size={15} /> CV STÜDYOSU <span>01</span>
          </span>
        </div>

        {health === 'error' && (
          <div className="alert error" role="alert">
            Yerel sunucuya bağlanılamadı. Terminalde <code>npm run dev</code> çalıştır.
            <button onClick={() => void checkHealth()}>Tekrar dene</button>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            <span>{error}</span>
            <button className="icon-button" aria-label="Hatayı kapat" onClick={() => setError('')}>
              <X size={17} />
            </button>
          </div>
        )}

        <div className="workspace">
          <aside className="editor-panel" aria-label="CV düzenleyici">
            <nav className="editor-tabs" aria-label="Düzenleme adımları">
              {tabs.map(({ id, label, icon: Icon }, i) => (
                <button
                  key={id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => setTab(id)}
                  disabled={busy}
                  aria-current={tab === id ? 'step' : undefined}
                >
                  <Icon size={16} />
                  {label}
                  <span>{`0${i + 1}`}</span>
                </button>
              ))}
            </nav>

            {tab === 'upload' && (
              <div className="panel-body upload-panel">
                <div className="panel-intro">
                  <span className="step-kicker">01 / BAŞLANGIÇ</span>
                  <h2>
                    İçerik sende.
                    <br />
                    Düzen bizde.
                  </h2>
                  <p>Mevcut CV’ni ekle, bilgilerini sade ve profesyonel bir tasarıma taşıyalım.</p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".pdf,.docx,.txt,.tex,.md"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importCv(file);
                  }}
                />
                <div
                  className={`dropzone ${dragging ? 'dragging' : ''} ${busy ? 'processing' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (busy) return;
                    if (event.dataTransfer.files.length !== 1) {
                      setError('Lütfen tek bir CV dosyası bırak.');
                      return;
                    }
                    void importCv(event.dataTransfer.files[0]);
                  }}
                >
                  <button
                    className="drop-target"
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    <span className="upload-icon">
                      {busy ? (
                        <LoaderCircle className="spin" size={29} />
                      ) : (
                        <FileUp size={29} strokeWidth={1.4} />
                      )}
                    </span>
                    <strong>{busy ? 'CV’nin içeriği okunuyor…' : 'CV’ni buraya bırak'}</strong>
                    <span>
                      {busy ? (
                        useAi ? (
                          'Yerel modelin hızına göre birkaç dakika sürebilir.'
                        ) : (
                          'Bilgilerini düzenlenebilir bölümlere ayırıyoruz.'
                        )
                      ) : (
                        <>
                          veya <b>dosya seç</b>
                        </>
                      )}
                    </span>
                    {!busy && (
                      <small>
                        PDF, DOCX, TXT, TEX, MD <i>·</i> En fazla 10 MB
                      </small>
                    )}
                  </button>
                  {busy && (
                    <button className="text-button" onClick={() => controller.current?.abort()}>
                      İptal et
                    </button>
                  )}
                </div>
                <div className="or-divider">
                  <span />
                  veya
                  <span />
                </div>
                <button
                  className="paste-toggle"
                  onClick={() => setShowPaste(!showPaste)}
                  disabled={busy}
                  aria-expanded={showPaste}
                >
                  <Code2 size={17} />
                  <span>CV metnini ya da LaTeX kodunu yapıştır</span>
                  <ChevronDown size={16} className={showPaste ? 'rotated' : ''} />
                </button>
                {showPaste && (
                  <div className="paste-area">
                    <label htmlFor="paste-cv" className="sr-only">
                      CV metni veya LaTeX kodu
                    </label>
                    <textarea
                      id="paste-cv"
                      value={paste}
                      maxLength={MAX_TEXT}
                      onChange={(event) => setPaste(event.target.value)}
                      placeholder={'Ad Soyad\nE-posta · Telefon\n\nDeneyim\n…'}
                      rows={9}
                      disabled={busy}
                    />
                    <div className="paste-bottom">
                      <small>{paste.length.toLocaleString('tr')} / 80.000</small>
                      <button
                        className="small-primary"
                        disabled={busy || !paste.trim()}
                        onClick={() => void importCv()}
                      >
                        CV oluştur <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                )}
                <div className="ai-option">
                  <label>
                    <input
                      type="checkbox"
                      checked={useAi}
                      disabled={!ollama.available || busy}
                      onChange={(event) => setUseAi(event.target.checked)}
                    />
                    <span>
                      <strong>Yerel AI ile ayrıştır</strong>
                      <small>
                        {ollama.available
                          ? `${ollama.model} · Ollama hazır`
                          : ollama.reason || 'İsteğe bağlı · Ollama kurulumu gerekir'}
                      </small>
                    </span>
                    <Sparkles size={17} />
                  </label>
                  {!ollama.available && (
                    <details>
                      <summary>Nasıl etkinleştirilir?</summary>
                      <p>
                        Ollama’yı kurup <code>ollama pull {ollama.model}</code> çalıştır. Model
                        yüklendikten sonra{' '}
                        <button onClick={() => void checkHealth()}>bağlantıyı yenile</button>.
                        Standart dönüşüm için kurulum gerekmez.
                      </p>
                    </details>
                  )}
                </div>
                <div className="privacy-note">
                  <ShieldCheck size={19} />
                  <p>
                    <strong>CV’n bilgisayarında kalır.</strong>Dosyalar sunucuya kaydedilmez ve
                    bulut servislerine gönderilmez.
                  </p>
                </div>
                <button className="demo-button" onClick={loadDemo} disabled={busy}>
                  <span className="demo-icon">
                    <FileCheck2 size={19} />
                  </span>
                  <span>
                    <strong>Önce bir örneğe göz at</strong>
                    <small>Kurmaca bir CV ile tasarımı keşfet</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              </div>
            )}

            {tab === 'content' && (
              <div className="panel-body content-panel">
                <div className="compact-intro">
                  <span className="step-kicker">02 / BİLGİLERİN</span>
                  <h2>Hikâyeni netleştir.</h2>
                  <p>Değişiklikler anında önizlemeye yansır.</p>
                </div>
                {sourceName && (
                  <div className="source-badge">
                    <FileCheck2 size={16} />
                    <span>{sourceName}</span>
                    <Check size={15} />
                  </div>
                )}
                {warnings.length > 0 && (
                  <details className="review-note" open>
                    <summary>
                      <ShieldCheck size={16} /> İndirmeden önce kontrol et
                    </summary>
                    <ul>
                      {warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="personal-fields">
                  <label>
                    Ad soyad
                    <input
                      value={resume.name}
                      maxLength={200}
                      onChange={(event) => updateResume({ ...resume, name: event.target.value })}
                      placeholder="Ad Soyad"
                    />
                  </label>
                  <label>
                    Meslek / kısa başlık
                    <input
                      value={resume.headline}
                      maxLength={300}
                      onChange={(event) =>
                        updateResume({ ...resume, headline: event.target.value })
                      }
                      placeholder="Örn. Software Engineer"
                    />
                  </label>
                  <label>
                    İletişim bilgileri
                    <span className="field-help">
                      Her satıra bir bilgi: e-posta, telefon, konum veya bağlantı.
                    </span>
                    <textarea
                      value={resume.contacts.join('\n')}
                      rows={4}
                      maxLength={4800}
                      onChange={(event) =>
                        updateResume({ ...resume, contacts: event.target.value.split('\n') })
                      }
                    />
                  </label>
                </div>
                <div className="section-list-heading">
                  <h3>Bölümler</h3>
                  <span>{resume.sections.length} bölüm</span>
                </div>
                <p className="field-help">
                  Vurgulamak için **iki yıldız**, liste maddeleri için satır başında -
                  kullanabilirsin.
                </p>
                <div className="section-list">
                  {resume.sections.map((section, index) => (
                    <details
                      key={section.id}
                      className="section-editor"
                      open={resume.sections.length === 1 ? true : undefined}
                    >
                      <summary>
                        <GripVertical size={15} />
                        <span>{section.title || 'İsimsiz bölüm'}</span>
                        <ChevronDown size={16} />
                      </summary>
                      <div className="section-fields">
                        <label>
                          Bölüm başlığı
                          <input
                            value={section.title}
                            maxLength={120}
                            onChange={(event) =>
                              updateSection(section.id, { title: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          İçerik
                          <textarea
                            rows={Math.min(13, Math.max(5, section.content.split('\n').length))}
                            value={section.content}
                            maxLength={MAX_TEXT}
                            onChange={(event) =>
                              updateSection(section.id, { content: event.target.value })
                            }
                          />
                        </label>
                        <div className="section-tools">
                          <button
                            className="icon-button"
                            disabled={index === 0}
                            aria-label={`${section.title} bölümünü yukarı taşı`}
                            onClick={() => moveSection(index, -1)}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            className="icon-button"
                            disabled={index === resume.sections.length - 1}
                            aria-label={`${section.title} bölümünü aşağı taşı`}
                            onClick={() => moveSection(index, 1)}
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            className="delete-section"
                            onClick={() => {
                              if (window.confirm(`“${section.title}” bölümü silinsin mi?`))
                                updateResume({
                                  ...resume,
                                  sections: resume.sections.filter((s) => s.id !== section.id),
                                });
                            }}
                          >
                            <Trash2 size={14} /> Bölümü sil
                          </button>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
                <button
                  className="add-section"
                  disabled={resume.sections.length >= 24}
                  onClick={() =>
                    updateResume({
                      ...resume,
                      sections: [
                        ...resume.sections,
                        { id: crypto.randomUUID(), title: 'Yeni bölüm', content: '' },
                      ],
                    })
                  }
                >
                  <Plus size={16} /> Bölüm ekle
                </button>
                {sourceText && (
                  <details className="source-text">
                    <summary>
                      Çıkarılan kaynak metni göster <ChevronDown size={15} />
                    </summary>
                    <p>Aktarılmayan bilgileri buradan kopyalayıp ilgili bölüme ekleyebilirsin.</p>
                    <textarea
                      aria-label="Çıkarılan kaynak metin"
                      readOnly
                      value={sourceText}
                      rows={13}
                    />
                  </details>
                )}
                <button className="next-step" onClick={() => setTab('design')}>
                  Tasarımı düzenle <ArrowRight size={16} />
                </button>
              </div>
            )}

            {tab === 'design' && (
              <div className="panel-body design-panel">
                <div className="compact-intro">
                  <span className="step-kicker">03 / SON DOKUNUŞ</span>
                  <h2>İçeriğine alan aç.</h2>
                  <p>Okunaklı tipografi. Dengeli boşluklar. Sade bir düzen.</p>
                </div>
                <fieldset className="template-field">
                  <legend>CV şablonu</legend>
                  <div className="template-options">
                    {(['classic', 'modern'] as const).map((template) => (
                      <button
                        key={template}
                        className={`template-option ${design.template === template ? 'selected' : ''}`}
                        onClick={() => {
                          setDesign({ ...design, template });
                          setDirty(true);
                        }}
                        aria-pressed={design.template === template}
                      >
                        <div className={`mini-document ${template}`} aria-hidden="true">
                          <b>Deniz Yılmaz</b>
                          <i />
                          <em>EXPERIENCE</em>
                          <i />
                          <i />
                          <i className="short" />
                          <em>EDUCATION</em>
                          <i />
                          <i className="short" />
                        </div>
                        <span>
                          {template === 'classic' ? 'Klasik' : 'Modern'}
                          {design.template === template && <Check size={15} />}
                        </span>
                        <small>
                          {template === 'classic' ? 'LaTeX’ten ilham alan' : 'Sade ve çağdaş'}
                        </small>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="density-field">
                  <legend>Sayfa yoğunluğu</legend>
                  <div className="segmented">
                    {(['comfortable', 'compact'] as const).map((density) => (
                      <button
                        key={density}
                        className={design.density === density ? 'selected' : ''}
                        aria-pressed={design.density === density}
                        onClick={() => {
                          setDesign({ ...design, density });
                          setDirty(true);
                        }}
                      >
                        {density === 'comfortable' ? 'Dengeli' : 'Kompakt'}
                      </button>
                    ))}
                  </div>
                  <p className="field-help">
                    Kompakt görünüm, bölümler ve maddeler arasındaki boşluğu azaltır.
                  </p>
                </fieldset>
                <label className="font-control">
                  <span>
                    <span>
                      <Type size={17} /> Yazı boyutu
                    </span>
                    <strong>{design.fontSize} pt</strong>
                  </span>
                  <input
                    type="range"
                    min="9"
                    max="12"
                    step="0.5"
                    value={design.fontSize}
                    onChange={(event) => {
                      setDesign({ ...design, fontSize: Number(event.target.value) });
                      setDirty(true);
                    }}
                  />
                  <span className="range-labels">
                    <span>9 pt</span>
                    <span>12 pt</span>
                  </span>
                </label>
                <div className="design-note">
                  <FileText size={20} />
                  <div>
                    <strong>İçerik kesilmez.</strong>
                    <p>
                      Uzun CV’ler PDF’de birden fazla A4 sayfasına ayrılır. Tek sayfaya yaklaşmak
                      için kompakt görünümü deneyebilirsin.
                    </p>
                  </div>
                </div>
                <button className="reset-design" onClick={() => setDesign(defaultDesign)}>
                  <RotateCcw size={15} /> Varsayılan tasarıma dön
                </button>
                <div className="overleaf-note">
                  <Code2 size={19} />
                  <div>
                    <strong>Overleaf’te devam etmek ister misin?</strong>
                    <p>
                      LaTeX dosyanı indir, Overleaf’e yükle ve derleyiciyi <b>XeLaTeX</b> olarak
                      seç. PDF ve LaTeX’in sayfa kırılımları farklı olabilir.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="panel-footer">
              <LockKeyhole size={13} />
              <span>İçerik yalnızca bu oturumda tutulur.</span>
            </div>
          </aside>

          <section className="preview-panel" aria-label="Önizleme ve indirme">
            <div className="preview-toolbar">
              <div>
                <span className="preview-dot" />
                <strong>Canlı önizleme</strong>
                <span className="example-tag">
                  {sourceName ? (method === 'ollama' ? 'Yerel AI' : 'CV’n') : 'Örnek CV'}
                </span>
              </div>
              <span className="paper-format">
                A4 <span>210 × 297 mm</span>
              </span>
            </div>
            <div className="preview-canvas">
              <Preview resume={resume} design={design} />
              <div className="preview-caption">
                <CheckCheck size={14} />
                <span>
                  Seçilebilir metin <i>·</i> Tek sütun <i>·</i> Akış önizlemesi
                </span>
              </div>
            </div>
            <div className="download-bar">
              <div className="document-summary">
                <span className="download-file-icon">
                  <FileText size={20} />
                </span>
                <div>
                  <strong>{sourceName ? 'CV’n indirmeye hazır' : 'Örnek tasarımı keşfet'}</strong>
                  <small>
                    {resume.sections.filter((s) => s.content.trim()).length} bölüm <i>·</i>{' '}
                    {totalWords} kelime
                  </small>
                </div>
              </div>
              <div className="download-actions">
                <button
                  className="tex-button"
                  disabled={!!exporting || busy}
                  onClick={() => void download('tex')}
                >
                  {exporting === 'tex' ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Code2 size={17} />
                  )}
                  <span>.tex</span>
                </button>
                <button
                  className="download-button"
                  disabled={!!exporting || busy}
                  onClick={() => void download('pdf')}
                >
                  {exporting === 'pdf' ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <ArrowDownToLine size={17} />
                  )}
                  <span>{exporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF indir'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
        <footer className="app-footer">
          <span>İyi bir CV, deneyimini görünür kılar.</span>
          <span>
            Açık kaynak <i>·</i> Hesap gerekmez <i>·</i> Buluta gönderilmez
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice('')}
            aria-label="Bildirimi kapat"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
