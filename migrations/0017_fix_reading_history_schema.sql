-- Migration 0017: Fix reading_history schema inconsistencies
-- Synchronize local schema with production database structure

-- Step 1: Add missing club_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reading_history' AND column_name = 'club_id'
    ) THEN
        ALTER TABLE "reading_history" ADD COLUMN "club_id" varchar;
        
        -- Add foreign key constraint for club_id
        ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_club_id_fk" 
        FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL;
        
        -- Add index for club_id
        CREATE INDEX "reading_history_club_id_idx" ON "reading_history"("club_id");
        
        RAISE NOTICE 'Added club_id column to reading_history table';
    ELSE
        RAISE NOTICE 'club_id column already exists in reading_history table';
    END IF;
END $$;

-- Step 2: Update book_id foreign key constraint to reference books.id instead of personal_books.id
-- First, check if the constraint exists and what it references
DO $$
DECLARE
    constraint_exists boolean;
    referenced_table text;
BEGIN
    -- Check if FK constraint exists and what table it references
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'reading_history' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'book_id'
    ), 
    (
        SELECT ccu.table_name FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'reading_history' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'book_id'
        LIMIT 1
    )
    INTO constraint_exists, referenced_table;
    
    IF constraint_exists THEN
        IF referenced_table = 'books' THEN
            RAISE NOTICE 'book_id FK constraint already references books table correctly';
        ELSE
            RAISE NOTICE 'book_id FK constraint references %, need to update to books', referenced_table;
            
            -- Drop existing constraint
            ALTER TABLE "reading_history" DROP CONSTRAINT IF EXISTS "reading_history_book_id_fk";
            
            -- Add new constraint referencing books.id
            ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_book_id_fk" 
            FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
            
            RAISE NOTICE 'Updated book_id FK constraint to reference books table';
        END IF;
    ELSE
        -- No FK constraint exists, add one referencing books.id
        ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_book_id_fk" 
        FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
        
        RAISE NOTICE 'Added book_id FK constraint referencing books table';
    END IF;
END $$;

-- Step 3: Ensure all required indexes exist
CREATE INDEX IF NOT EXISTS "reading_history_user_id_idx" ON "reading_history"("user_id");
CREATE INDEX IF NOT EXISTS "reading_history_book_id_idx" ON "reading_history"("book_id");
CREATE INDEX IF NOT EXISTS "reading_history_completed_at_idx" ON "reading_history"("completed_at");
CREATE INDEX IF NOT EXISTS "reading_history_user_book_idx" ON "reading_history"("user_id", "book_id");

-- Step 4: Add comment to clarify the schema
COMMENT ON TABLE "reading_history" IS 'Stores completed reading history for both personal and club books';
COMMENT ON COLUMN "reading_history"."book_id" IS 'References books.id (unified book table)';
COMMENT ON COLUMN "reading_history"."club_id" IS 'Optional club context, NULL for personal reading';

-- Migration completed
DO $$ BEGIN
    RAISE NOTICE 'Migration 0017 completed: reading_history schema synchronized';
END $$;