import { Column, Entity, PrimaryColumn } from 'typeorm';
import { Timestamped, asJson, asNumber } from './columns';
import type { Progress } from '@/types';

/** A player's progress (the game's Progress, decided by the server), with the numbers worth querying copied out. */
@Entity('progress')
export class ProgressRow extends Timestamped {
    @PrimaryColumn({ name: 'player_id', type: 'int', unsigned: true })
    playerId!: number;

    @Column({ type: 'longtext', transformer: asJson })
    data!: Progress;

    @Column({ type: 'int', default: 0 })
    trophies!: number;

    @Column({ name: 'best_trophies', type: 'int', default: 0 })
    bestTrophies!: number;

    @Column({ type: 'int', default: 0 })
    wins!: number;

    @Column({ name: 'endless_best', type: 'double', default: 0 })
    endlessBest!: number;

    /** When it was saved (ms). */
    @Column({ name: 'saved_at', type: 'bigint', default: 0, transformer: asNumber })
    savedAt!: number;
}
