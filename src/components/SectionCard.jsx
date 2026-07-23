import PropTypes from 'prop-types';
import Card from './Card';

// SectionCard — the standard titled card/panel used across the app.
//
// One header convention so every section reads the same: a title (h5.card-title),
// an optional `subtitle` shown as a hover tooltip on the title (keeps headers
// quiet), and an optional right-aligned `action` node (a save indicator, a
// button, a filter — anything). Prefer this over
// hand-rolling `<Card><Card.Body><h6>…` with ad-hoc heading styles.
//
// Heading hierarchy: page = h4.fw-bold, section/card = h5.card-title (this),
// in-card subsection label = h6.fw-semibold.text-muted.small.text-uppercase.
//
// See docs/standards/ui-ux.md → "Cards & Sections".
export default function SectionCard({
  title,
  subtitle,
  action,
  footer,
  children,
  className = '',
  bodyClassName = '',
  headerClassName = '',
}) {
  return (
    <Card className={className}>
      {(title || action) ? (
        <Card.Header className={`align-items-center ${headerClassName}`}>
          <Card.Header.Title>
            {title ? (
              <h5 className="card-title mb-0" title={typeof subtitle === 'string' ? subtitle : undefined}>{title}</h5>
            ) : null}
          </Card.Header.Title>
          {action ? <Card.Header.Action className="d-flex align-items-center gap-2">{action}</Card.Header.Action> : null}
        </Card.Header>
      ) : null}
      <Card.Body className={bodyClassName}>{children}</Card.Body>
      {footer ? <Card.Footer>{footer}</Card.Footer> : null}
    </Card>
  );
}

SectionCard.propTypes = {
  /** Section heading (h5.card-title). Omit for a headerless card. */
  title: PropTypes.node,
  /** Optional short description, shown as a hover tooltip on the title (string). */
  subtitle: PropTypes.node,
  /** Right-aligned header node — save status, a button, a filter, etc. */
  action: PropTypes.node,
  /** Optional card footer. */
  footer: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string,
  bodyClassName: PropTypes.string,
  headerClassName: PropTypes.string,
};
