-- CreateTable
CREATE TABLE `users` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'merchant', 'affiliate') NOT NULL DEFAULT 'affiliate',
    `language_preference` VARCHAR(10) NOT NULL DEFAULT 'en',
    `currency_code` CHAR(3) NOT NULL DEFAULT 'EUR',
    `reset_token` VARCHAR(255) NULL,
    `reset_token_expiry` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `email`(`email`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_products` (
    `product_id` INTEGER NOT NULL AUTO_INCREMENT,
    `merchant_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `image_url` TEXT NOT NULL,
    `merchant_url` TEXT NOT NULL,
    `commission_rate` DECIMAL(5, 2) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `total_clicks` INTEGER NOT NULL DEFAULT 0,
    `total_purchases` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `price` DECIMAL(10, 2) NULL DEFAULT 20.00,

    INDEX `merchant_id`(`merchant_id`),
    PRIMARY KEY (`product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_links` (
    `link_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_visible` BOOLEAN NULL DEFAULT true,
    `expires_at` DATETIME(0) NULL,

    UNIQUE INDEX `token`(`token`),
    INDEX `product_id`(`product_id`),
    INDEX `user_id`(`user_id`),
    PRIMARY KEY (`link_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clicks` (
    `click_id` INTEGER NOT NULL AUTO_INCREMENT,
    `link_id` INTEGER NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `referrer` TEXT NULL,
    `clicked_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `link_id`(`link_id`),
    PRIMARY KEY (`click_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `currencies` (
    `code` CHAR(3) NOT NULL,
    `symbol` VARCHAR(5) NOT NULL,
    `minor_unit` INTEGER NOT NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_rates` (
    `base_currency` CHAR(3) NOT NULL,
    `target_currency` CHAR(3) NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `valid_from` DATETIME(0) NOT NULL,
    `valid_to` DATETIME(0) NOT NULL,

    INDEX `target_currency`(`target_currency`),
    PRIMARY KEY (`base_currency`, `target_currency`, `valid_from`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_payments` (
    `payment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `merchant_id` INTEGER NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `status` ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `payout_item_id` INTEGER NULL,

    INDEX `merchant_id`(`merchant_id`),
    INDEX `payout_item_id`(`payout_item_id`),
    PRIMARY KEY (`payment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payout_requests` (
    `request_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `amount_total` DECIMAL(19, 4) NOT NULL,
    `status` ENUM('pending', 'approved', 'paid', 'rejected') NOT NULL DEFAULT 'pending',
    `requested_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `paid_at` DATETIME(0) NULL,

    INDEX `user_id`(`user_id`),
    PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_messages` (
    `message_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `name` VARCHAR(100) NULL,
    `email` VARCHAR(255) NULL,
    `message` TEXT NOT NULL,
    `submitted_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `user_id`(`user_id`),
    PRIMARY KEY (`message_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `settings_id` INTEGER NOT NULL AUTO_INCREMENT,
    `key_name` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `key_name`(`key_name`),
    PRIMARY KEY (`settings_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_user_sales` (
    `sale_id` INTEGER NOT NULL AUTO_INCREMENT,
    `click_id` INTEGER NOT NULL,
    `order_id` VARCHAR(100) NOT NULL,
    `product_id` INTEGER NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `commission_affiliate` DECIMAL(19, 4) NOT NULL,
    `commission_platform` DECIMAL(19, 4) NOT NULL,
    `status` ENUM('pending', 'confirmed', 'rejected') NOT NULL DEFAULT 'pending',
    `converted_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `order_id`(`order_id`),
    INDEX `click_id`(`click_id`),
    INDEX `product_id`(`product_id`),
    PRIMARY KEY (`sale_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payout_request_items` (
    `item_id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `source_sale_ids` TEXT NULL,

    INDEX `merchant_id`(`merchant_id`),
    INDEX `request_id`(`request_id`),
    PRIMARY KEY (`item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_earnings` (
    `earning_id` INTEGER NOT NULL AUTO_INCREMENT,
    `sale_id` INTEGER NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency_code` CHAR(3) NOT NULL DEFAULT 'EUR',
    `logged_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `currency_code`(`currency_code`),
    INDEX `sale_id`(`sale_id`),
    PRIMARY KEY (`earning_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `merchant_products` ADD CONSTRAINT `merchant_products_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `affiliate_links` ADD CONSTRAINT `affiliate_links_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `affiliate_links` ADD CONSTRAINT `affiliate_links_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `merchant_products`(`product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `clicks` ADD CONSTRAINT `clicks_ibfk_1` FOREIGN KEY (`link_id`) REFERENCES `affiliate_links`(`link_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_ibfk_1` FOREIGN KEY (`base_currency`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_ibfk_2` FOREIGN KEY (`target_currency`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `merchant_payments` ADD CONSTRAINT `merchant_payments_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `merchant_payments` ADD CONSTRAINT `merchant_payments_ibfk_2` FOREIGN KEY (`payout_item_id`) REFERENCES `payout_request_items`(`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payout_requests` ADD CONSTRAINT `payout_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contact_messages` ADD CONSTRAINT `contact_messages_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `affiliate_user_sales` ADD CONSTRAINT `affiliate_user_sales_ibfk_1` FOREIGN KEY (`click_id`) REFERENCES `clicks`(`click_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `affiliate_user_sales` ADD CONSTRAINT `affiliate_user_sales_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `merchant_products`(`product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payout_request_items` ADD CONSTRAINT `payout_request_items_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `payout_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payout_request_items` ADD CONSTRAINT `payout_request_items_ibfk_2` FOREIGN KEY (`merchant_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `platform_earnings` ADD CONSTRAINT `platform_earnings_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `affiliate_user_sales`(`sale_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `platform_earnings` ADD CONSTRAINT `platform_earnings_ibfk_2` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;
