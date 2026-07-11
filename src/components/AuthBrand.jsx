/**
 * Composite brand mark used on auth pages. Ported from sentinel-ui —
 * auth surfaces must look the same across SafePass apps so the sign-in
 * flow stays familiar; per-app identity lives in the `subtext` only.
 * Left: logo image. Right: heading + subtext.
 */
export default function AuthBrand({
  heading = 'SafePass',
  subtext = '',
  imageSrc = '/assets/images/safepass_white_bg_128.png',
}) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-3">
      <div
        className="d-flex align-items-center justify-content-center rounded"
        style={{
          width: 56,
          height: 56
        }}
      >
        <img
          src={imageSrc}
          alt={heading}
          className="img-fluid"
          style={{ height: '100%', width: '100%', objectFit: 'contain' }}
        />
      </div>
      <div className="text-start">
        <div className="h4 mb-0 fw-semibold"
          style={{ fontSize: "2.35rem"}}>{heading}</div>
        <div className="text-muted small"
          style={{ fontSize: "1.15rem"}}>{subtext}</div>
      </div>
    </div>
  );
}
