/* eslint-disable react-refresh/only-export-components -- ported verbatim from
   sentinel-ui, which co-locates the hook with its component; kept identical for
   upstream parity at the cost of fast-refresh on this file. */
import { useState, useCallback, useRef } from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';

/**
 * Reusable confirmation modal for destructive and important actions.
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirmModal();
 *
 *   const handleDelete = async () => {
 *     const ok = await confirm({
 *       title: 'Delete Visitor',
 *       body: 'Are you sure you want to delete John Doe?',
 *       confirmLabel: 'Delete',
 *       variant: 'danger',
 *     });
 *     if (!ok) return;
 *     await dm.visitors.remove(id, version);
 *   };
 *
 *   return <>{ConfirmDialog}<ConfirmDialog />;
 */

const ConfirmModal = ({ show, title, body, confirmLabel, cancelLabel, variant, loading, onConfirm, onCancel }) => (
  <Modal show={show} onHide={onCancel} centered>
    <Modal.Header closeButton>
      <Modal.Title>{title}</Modal.Title>
    </Modal.Header>
    <Modal.Body>{body}</Modal.Body>
    <Modal.Footer>
      <Button variant="outline-secondary" onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </Button>
      <Button variant={variant} onClick={onConfirm} disabled={loading}>
        {loading ? (
          <>
            <Spinner animation="border" size="sm" className="me-1" />
            {confirmLabel}
          </>
        ) : (
          confirmLabel
        )}
      </Button>
    </Modal.Footer>
  </Modal>
);

export function useConfirmModal() {
  const [state, setState] = useState({
    show: false,
    title: 'Confirm',
    body: 'Are you sure?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'danger',
    loading: false,
  });

  const resolveRef = useRef(null);

  const confirm = useCallback(({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        show: true,
        title,
        body,
        confirmLabel,
        cancelLabel,
        variant,
        loading: false,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, show: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, show: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const ConfirmDialog = (
    <ConfirmModal
      show={state.show}
      title={state.title}
      body={state.body}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      loading={state.loading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, ConfirmDialog };
}

export default ConfirmModal;

