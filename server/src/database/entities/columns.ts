import { CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from 'typeorm';
import type { ValueTransformer } from 'typeorm';

/**
 * A JSON column's value. MariaDB marks a `CHECK (JSON_VALID(…))` column as JSON, and the driver then hands it back
 * already parsed; where it doesn't, the text (or bytes) are parsed here.
 */
export function fromJson(v: unknown): unknown {
    if (v == null) return null;
    if (typeof v === 'string') return JSON.parse(v) as unknown;
    if (Buffer.isBuffer(v)) return JSON.parse(v.toString('utf8')) as unknown;
    return v;
}

/** A JSON document kept in a LONGTEXT column: written as text, read back as the value. */
export const asJson: ValueTransformer = {
    to: (v: unknown) => (v == null ? v : JSON.stringify(v)),
    from: fromJson,
};

/** A BIGINT or DECIMAL column read as a JavaScript number (the driver gives those as strings). */
export const asNumber: ValueTransformer = {
    to: (v: unknown) => v,
    from: (v: unknown) => (v == null ? null : Number(v)),
};

/**
 * The three columns every table ends with: when the row was made, last changed, and soft-deleted (a deleted row
 * stays in the table but every query leaves it out).
 */
export abstract class Timestamped {
    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt!: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
    deletedAt!: Date | null;
}
