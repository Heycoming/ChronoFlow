-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "preferredDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
