import { Layout } from '../components/Layout';

/** Generic placeholder for modules scheduled for later build phases. */
export function Placeholder({ title }: { title: string }) {
  return (
    <Layout title={title}>
      <div className="card mx-auto mt-8 max-w-lg text-center">
        <div className="mb-3 text-4xl">🚧</div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-slate-500">
          این ماژول در فاز بعدی پیاده‌سازی می‌شود. ساختار پایه (احراز هویت، چند-مستأجری،
          کنترل دسترسی) آماده است و این بخش روی همان الگوی ماژول «درخواست‌ها» افزوده خواهد شد.
        </p>
      </div>
    </Layout>
  );
}
