const { v4: uuidv4 } = require('uuid');
const db = require('../db/mysql');
const AppError = require('../utils/appError');
const DocumentContent = require('./documentContentModel');

exports.create = async (title, ownerId) => {
  const newDocumentId = uuidv4();
  const documentData = {
    id: newDocumentId,
    title: title || 'Untitled Document',
    owner_id: ownerId,
  };

  const ownerRoleId = 1;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('INSERT INTO documents SET ?', documentData);

    await connection.query(
      'INSERT INTO user_document_permissions (user_id, document_id, role_id) VALUES (?, ?, ?)',
      [ownerId, newDocumentId, ownerRoleId]
    );

    await DocumentContent.create({ _id: newDocumentId, content: '' });

    await connection.commit();

    return {
      id: documentData.id,
      title: documentData.title,
      owner_id: documentData.owner_id,
    };
  } catch (error) {
    await connection.rollback();
    console.error('Failed to create document:', error);
    throw new AppError('Failed to create document in database.', 500);
  } finally {
    connection.release();
  }
};

exports.findAllForUser = async (userId) => {
  const [rows] = await db.execute(
    `SELECT d.id, d.title, d.owner_id, d.created_at, d.updated_at
     FROM documents d
     JOIN user_document_permissions udp ON d.id = udp.document_id
     WHERE udp.user_id = ?`,
    [userId]
  );
  return rows;
};

exports.findById = async (documentId, userId) => {
  const sql = `
    SELECT d.*
    FROM documents d
    LEFT JOIN user_document_permissions udp ON d.id = udp.document_id
    WHERE d.id = ? AND (d.owner_id = ? OR udp.user_id = ?)
    GROUP BY d.id
  `;

  const [rows] = await db.execute(sql, [documentId, userId, userId]);

  return rows[0] || null;
};

exports.updateTitle = async (documentId, title) => {
  const [result] = await db.execute(
    'UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [title, documentId]
  );
  return result;
};

exports.remove = async (documentId) => {
  const [result] = await db.execute('DELETE FROM documents WHERE id = ?', [documentId]);
  return result;
};

exports.findOwner = async (documentId) => {
  const [rows] = await db.execute('SELECT owner_id FROM documents WHERE id = ?', [documentId]);
  return rows[0] ? rows[0].owner_id : null;
};

exports.addPermission = async (documentId, userId, roleId) => {
  const [existing] = await db.execute(
    'SELECT * FROM user_document_permissions WHERE document_id = ? AND user_id = ?',
    [documentId, userId]
  );

  if (existing.length > 0) {
    throw new AppError('This user already has access to the document.', 409);
  }

  const sql =
    'INSERT INTO user_document_permissions (document_id, user_id, role_id) VALUES (?, ?, ?)';
  const [result] = await db.execute(sql, [documentId, userId, roleId]);

  return {
    permissionId: result.insertId,
    documentId,
    userId,
    roleId,
  };
};

exports.getPermissions = async (documentId) => {
  const sql = `
    SELECT u.id, u.username, u.email, r.name AS role_name
    FROM user_document_permissions udp
    JOIN users u ON udp.user_id = u.id
    JOIN roles r ON udp.role_id = r.id
    WHERE udp.document_id = ?
  `;
  const [rows] = await db.execute(sql, [documentId]);
  return rows;
};

exports.removePermission = async (documentId, userIdToRemove) => {
  const sql = 'DELETE FROM user_document_permissions WHERE document_id = ? AND user_id = ?';
  const [result] = await db.execute(sql, [documentId, userIdToRemove]);

  return result;
};

exports.getUserRole = async (documentId, userId) => {
  const ownerId = await this.findOwner(documentId);
  if (ownerId === userId) {
    return { name: 'owner' };
  }

  const sql = `
    SELECT r.name
    FROM user_document_permissions udp
    JOIN roles r ON udp.role_id = r.id
    WHERE udp.document_id = ? AND udp.user_id = ?
  `;
  const [rows] = await db.execute(sql, [documentId, userId]);

  return rows[0] || null;
};

exports.setPublicStatus = async (documentId, isPublic) => {
  const sql = 'UPDATE documents SET is_public = ? WHERE id = ?';
  const [result] = await db.execute(sql, [!!isPublic, documentId]);

  return result;
};

exports.isPublic = async (documentId) => {
  const sql = 'SELECT is_public FROM documents WHERE id = ?';
  const [rows] = await db.execute(sql, [documentId]);

  return rows[0] ? !!rows[0].is_public : false;
};

exports.createInvitation = async (documentId, inviterId, inviteeId, roleId) => {
  const sql = `
    INSERT INTO document_invitations (document_id, inviter_id, invitee_id, role_id)
    VALUES (?, ?, ?, ?)
  `;
  try {
    const [result] = await db.execute(sql, [documentId, inviterId, inviteeId, roleId]);
    return {
      invitationId: result.insertId,
      documentId,
      inviteeId,
      roleId,
    };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError('An invitation for this user on this document already exists.', 409);
    }
    throw error;
  }
};

exports.getInvitationsForUser = async (userId) => {
  const sql = `
    SELECT i.id, i.document_id, d.title, u.username AS inviter_name, r.name AS role_name
    FROM document_invitations i
    JOIN documents d ON i.document_id = d.id
    JOIN users u ON i.inviter_id = u.id
    JOIN roles r ON i.role_id = r.id
    WHERE i.invitee_id = ? AND i.status = 'pending'
  `;
  const [invitations] = await db.execute(sql, [userId]);
  return invitations;
};

exports.acceptInvitation = async (invitationId, userId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [invites] = await connection.execute(
      'SELECT * FROM document_invitations WHERE id = ? AND invitee_id = ? AND status = "pending" FOR UPDATE',
      [invitationId, userId]
    );
    const invitation = invites[0];

    if (!invitation) {
      throw new AppError(
        'Invitation not found, already acted upon, or you are not the invitee.',
        404
      );
    }

    await connection.execute(
      'INSERT INTO user_document_permissions (document_id, user_id, role_id) VALUES (?, ?, ?)',
      [invitation.document_id, invitation.invitee_id, invitation.role_id]
    );

    await connection.execute('UPDATE document_invitations SET status = "accepted" WHERE id = ?', [
      invitationId,
    ]);

    await connection.commit();
    return invitation;
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError('You already have permission for this document.', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
};

exports.declineInvitation = async (invitationId, userId) => {
  const sql = `
    UPDATE document_invitations
    SET status = 'declined'
    WHERE id = ? AND invitee_id = ? AND status = 'pending'
  `;

  const [result] = await db.execute(sql, [invitationId, userId]);

  return result;
};
