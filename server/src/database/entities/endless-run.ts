import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped } from './columns';

/** An Endless run; the leaderboard is each player's longest. */
@Entity('endless_runs')
export class EndlessRun extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @Column({ name: 'player_id', type: 'int', unsigned: true })
    playerId!: number;

    @Column({ type: 'double' })
    seconds!: number;

    @Column({ type: 'int', default: 0 })
    guardians!: number;

    /** A characters id. */
    @Column({ type: 'varchar', length: 16 })
    fairy!: string;

    /** A maps id. */
    @Column({ type: 'varchar', length: 16 })
    map!: string;

    @Column({ name: 'best_chain', type: 'int', default: 0 })
    bestChain!: number;
}
