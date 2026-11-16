import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped } from './columns';

/** A player: a guest for now (one per browser), known by a token whose SHA-256 is all the server keeps. */
@Entity('players')
export class Player extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id!: number;

    @Column({ name: 'token_hash', type: 'char', length: 64 })
    tokenHash!: string;

    @Column({ type: 'varchar', length: 24 })
    name!: string;

    @Column({ name: 'seen_at', type: 'datetime' })
    seenAt!: Date;
}
