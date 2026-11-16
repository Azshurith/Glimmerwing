import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped } from './columns';

/** An Endless run; the leaderboard is each player's longest. */
@Entity('players_runs')
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
    @Column({ name: 'fairy_id', type: 'int', unsigned: true })
    fairyId!: number;

    /** A maps id. */
    @Column({ name: 'map_id', type: 'int', unsigned: true })
    mapId!: number;

    @Column({ name: 'best_chain', type: 'int', default: 0 })
    bestChain!: number;
}
