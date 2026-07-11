import { Badge } from 'react-bootstrap';
import { statusVariant } from '../lib/statusVariants.js';

// Status chip: color truth lives in statusVariants.js (ported from
// sentinel-ui — do not invent per-screen mappings). 4px radius per the
// design tokens: badges are rectangles, not pills.
export default function StatusBadge({ status }) {
  if (!status) return null;
  return <Badge bg={statusVariant(status)}>{String(status).replaceAll('_', ' ')}</Badge>;
}
