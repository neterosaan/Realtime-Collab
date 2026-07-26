-- --- START OF SCRIPT ---

-- Select the database to ensure all commands run in the right place.
USE `collab_platform`;

-- Temporarily disable foreign key checks to allow dropping tables in any order.
SET FOREIGN_KEY_CHECKS = 0;

-- Drop all tables to ensure a clean slate.
DROP TABLE IF EXISTS `document_invitations`;
DROP TABLE IF EXISTS `user_document_permissions`;
DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `documents`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `roles`;
-- Re-enable foreign key checks.
SET FOREIGN_KEY_CHECKS = 1;

-- --- RECREATE ALL TABLES WITH CONSISTENT DATA TYPES ---

-- 1. USERS table with VARCHAR ID (as you correctly identified).
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL PRIMARY KEY,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. ROLES table (this one is simple and can stay as is).
CREATE TABLE `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- 3. DOCUMENTS table with corrected foreign key type.
CREATE TABLE `documents` (
  `is_public` BOOLEAN NOT NULL DEFAULT FALSE, -- <<< ADD THIS LINE
  `id` VARCHAR(36) NOT NULL PRIMARY KEY, -- It's best practice to use UUIDs for document IDs too.
  `title` VARCHAR(255) NOT NULL DEFAULT 'Untitled Document',
  `owner_id` VARCHAR(36) NOT NULL,      -- IMPORTANT: Changed from INT to VARCHAR(36) to match users.id
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. USER_DOCUMENT_PERMISSIONS table with all foreign key types corrected.
CREATE TABLE `user_document_permissions` (
  `user_id` VARCHAR(36) NOT NULL,      -- IMPORTANT: Changed from INT to VARCHAR(36)
  `document_id` VARCHAR(36) NOT NULL,  -- IMPORTANT: Changed from INT to VARCHAR(36)
  `role_id` INT NOT NULL,
  PRIMARY KEY (`user_id`, `document_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `refresh_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;



-- 5. Re-insert the initial data for roles.
INSERT INTO `roles` (`id`, `name`) VALUES
(1, 'owner'),
(2, 'editor'),
(3, 'viewer'),
(4, 'commenter');

-- Give a final confirmation message.
SELECT 'Database schema successfully recreated!' AS status;

-- --- END OF SCRIPT ---
CREATE TABLE document_invitations (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `document_id` VARCHAR(36) NOT NULL,
    `inviter_id` VARCHAR(36) NOT NULL,
    `invitee_id` VARCHAR(36) NOT NULL,
    `role_id` INT NOT NULL,
    `status` ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`invitee_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
    
    UNIQUE KEY `unique_invitation` (`document_id`, `invitee_id`)
) ENGINE=InnoDB;