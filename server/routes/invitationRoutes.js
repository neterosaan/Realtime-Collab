const express = require('express');
const invitationController = require('../controllers/invitationController');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authController.protect);

/**
 * @swagger
 * /invitations:
 *   get:
 *     summary: List your pending invitations
 *     tags: [Invitations]
 *     responses:
 *       200:
 *         description: Pending invitations sent to you
 */
router.route('/').get(invitationController.getMyInvitations);


/**
 * @swagger
 * /invitations/{id}/accept:
 *   post:
 *     summary: Accept a pending invitation
 *     description: Race-safe -- if the same invitation is accepted twice concurrently, only one request succeeds (row-locked transaction).
 *     tags: [Invitations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Access granted
 *       404:
 *         description: Invitation not found, already acted upon, or not addressed to you
 */
router.route('/:id/accept').post(invitationController.acceptInvitation);

/**
 * @swagger
 * /invitations/{id}/decline:
 *   post:
 *     summary: Decline a pending invitation
 *     tags: [Invitations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Invitation declined
 *       404:
 *         description: Invitation not found, already acted upon, or not addressed to you
 */
router.route('/:id/decline').post(invitationController.declineInvitation);

module.exports = router;