import { useSearchParams } from 'react-router';
import { useProfile } from '@/components/profile/profile-context';
import {
  lastCompleteMonth,
  localToday,
  parseReportSearch,
  toReportSearch,
  type ReportView,
} from './report-view';

/**
 * The report view in the URL. Without parameters it opens on the most recent complete month,
 * filtered to the active profile, as PLAN.md section 3 "Monthly review" describes.
 */
export function useReportView(): [ReportView, (change: Partial<ReportView>) => void] {
  const [params, setParams] = useSearchParams();
  const { profile } = useProfile();
  const view = parseReportSearch(params, {
    month: lastCompleteMonth(localToday()),
    owner: profile.id,
  });
  const change = (next: Partial<ReportView>) => {
    setParams(toReportSearch({ ...view, ...next }));
  };
  return [view, change];
}
