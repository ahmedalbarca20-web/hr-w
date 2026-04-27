export function Spinner({ size = 8 }) {
  return (
    <span
      className={`w-${size} h-${size} border-4 border-brand/30 border-t-brand rounded-full animate-spin inline-block`}
      role="status"
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <Spinner size={10} />
    </div>
  );
}

export function SkeletonRow({ cols = 4 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="td">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export default Spinner;

