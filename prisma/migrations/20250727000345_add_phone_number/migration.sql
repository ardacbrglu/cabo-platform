-- AlterTable
ALTER TABLE `users` ADD COLUMN `phone_number` VARCHAR(25) NULL,
    ADD COLUMN `status` ENUM('pending', 'active', 'rejected') NOT NULL DEFAULT 'pending';
