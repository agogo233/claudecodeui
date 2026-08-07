import { cn } from '../../../lib/utils';

type TaskTabProgressProps = {
  done: number;
  total: number;
};

export default function TaskTabProgress({ done, total }: TaskTabProgressProps) {
  if (total <= 0) {
    return null;
  }

  const percent = Math.round((done / total) * 100);
  const complete = done >= total;

  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1 w-9 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <span
          className={cn('block h-full rounded-full transition-all duration-300', complete ? 'bg-green-500' : 'bg-blue-500')}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-[10px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">{percent}%</span>
    </span>
  );
}
