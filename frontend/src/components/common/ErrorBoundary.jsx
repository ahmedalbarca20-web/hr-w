import { Component } from 'react';

/**
 * Catches render errors (e.g. invalid hook, bad import) instead of a blank page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', err, info?.componentStack);
  }

  render() {
    const { err } = this.state;
    if (!err) return this.props.children;

    const msg = err?.message || String(err);
    return (
      <div
        dir="rtl"
        style={{
          minHeight: '100vh',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#fafafa',
          color: '#1a1a1a',
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>تعذّر تشغيل الواجهة</h1>
        <p style={{ marginBottom: 16, color: '#555', lineHeight: 1.6 }}>
          حدث خطأ أثناء التحميل. افتح أدوات المطوّر (F12) → Console لمعرفة التفاصيل. إذا فتحت الموقع من حاسبة
          أخرى عبر IP الشبكة، عيّن في ملف البيئة على جهاز التطوير:{' '}
          <code style={{ background: '#eee', padding: '2px 6px', borderRadius: 4 }}>VITE_DEV_LAN_HOST=192.168.x.x</code>
          ثم أعد تشغيل <code style={{ background: '#eee', padding: '2px 6px', borderRadius: 4 }}>npm run dev:all</code>.
        </p>
        <pre
          style={{
            background: '#fff0f0',
            border: '1px solid #f44336',
            borderRadius: 8,
            padding: 12,
            overflow: 'auto',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {msg}
        </pre>
      </div>
    );
  }
}
