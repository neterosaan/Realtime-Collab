const express = require('express');
const documentController = require('../controllers/documentController');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authController.protect);

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Create a new document
 *     tags: [Documents]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, example: My Document }
 *     responses:
 *       201:
 *         description: Document created, creator automatically granted owner access
 *   get:
 *     summary: List all documents you own or have access to
 *     tags: [Documents]
 *     responses:
 *       200:
 *         description: List of documents
 */
router.route('/').get(documentController.getAllDocuments).post(documentController.createDocument);

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a document by ID
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Document
 *       404:
 *         description: Document not found or you have no access
 *   patch:
 *     summary: Update the document title (owner only)
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, example: Renamed Document }
 *     responses:
 *       200:
 *         description: Document updated
 *       404:
 *         description: Document not found or you are not the owner
 *   delete:
 *     summary: Delete a document (owner only)
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Document deleted
 *       404:
 *         description: Document not found or you are not the owner
 */
router
  .route('/:id')
  .get(documentController.getDocument)
  .patch(authController.isOwner, documentController.updateDocument)
  .delete(authController.isOwner, documentController.deleteDocument);

/**
 * @swagger
 * /documents/{id}/share:
 *   post:
 *     summary: Invite a user to edit this document (owner only)
 *     description: Creates a pending invitation with editor access -- the invited user must accept it before they get real access.
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: someone@test.com }
 *     responses:
 *       201:
 *         description: Invitation created
 *       403:
 *         description: You are not the owner of this document
 *       404:
 *         description: No user found with that email
 */
router.route('/:id/share').post(authController.isOwner, documentController.shareDocument);

/**
 * @swagger
 * /documents/{id}/permissions:
 *   get:
 *     summary: List everyone with access to this document (owner only)
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of users and their roles
 *       403:
 *         description: You are not the owner of this document
 *   delete:
 *     summary: Remove a user's access to this document (owner only)
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIdToRemove]
 *             properties:
 *               userIdToRemove: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Access removed
 *       400:
 *         description: The owner cannot remove their own access
 *       403:
 *         description: You are not the owner of this document
 *       404:
 *         description: That user has no access to remove
 */
router
  .route('/:id/permissions')
  .get(authController.isOwner, documentController.getPermissions)
  .delete(authController.isOwner, documentController.removePermission);

/**
 * @swagger
 * /documents/{id}/public:
 *   put:
 *     summary: Set whether this document is publicly viewable (owner only)
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_public]
 *             properties:
 *               is_public: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Public status updated
 *       400:
 *         description: is_public must be a boolean
 *       403:
 *         description: You are not the owner of this document
 */
router.route('/:id/public').put(authController.isOwner, documentController.setPublicStatus);

/**
 * @swagger
 * /documents/{id}/view:
 *   get:
 *     summary: View a public document, self-granting viewer access if you don't already have any
 *     description: Intended to be called by a user who is NOT the owner and has no existing permission -- automatically creates a viewer permission on the spot if the document is public.
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Document (you already had access)
 *       201:
 *         description: Document (viewer access just granted)
 *       404:
 *         description: Document not found, or not public and you have no existing access
 */
router.route('/:id/view').get(documentController.viewPublicDocument);

module.exports = router;
