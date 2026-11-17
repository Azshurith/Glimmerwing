import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped } from './columns';

/** A finished match (VS CPU, 2 Players or Online), as the player it belongs to played it. */
@Entity('players_matches')
export class MatchRow extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @Column({ name: 'player_id', type: 'int', unsigned: true })
    playerId!: number;

    /** A types_modes id. */
    @Column({ name: 'mode_id', type: 'int', unsigned: true })
    modeId!: number;

    /** A maps id. */
    @Column({ name: 'map_id', type: 'int', unsigned: true })
    mapId!: number;

    /** A characters id: the player's fairy, and the rival's. */
    @Column({ name: 'fairy_id', type: 'int', unsigned: true })
    fairyId!: number;

    @Column({ name: 'rival_fairy_id', type: 'int', unsigned: true })
    rivalFairyId!: number;

    @Column({ name: 'rounds_won', type: 'tinyint', unsigned: true })
    roundsWon!: number;

    @Column({ name: 'rounds_lost', type: 'tinyint', unsigned: true })
    roundsLost!: number;

    @Column({ type: 'boolean' })
    won!: boolean;

    @Column({ name: 'best_chain', type: 'int', default: 0 })
    bestChain!: number;

    @Column({ name: 'trophy_delta', type: 'int', default: 0 })
    trophyDelta!: number;

    @Column({ type: 'double', default: 0 })
    seconds!: number;

    /** The players_replays id of the game's replay, if it has one. */
    @Column({ name: 'replay_id', type: 'bigint', unsigned: true, nullable: true })
    replayId!: string | null;
}
